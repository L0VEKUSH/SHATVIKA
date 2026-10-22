import bcrypt from 'bcrypt';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeAdminAccountManagement } from '@/lib/adminAccountAccess';
import { logServerError } from '@/lib/apiError';
import { connectToMongo } from '@/lib/mongoose';
import { distributedRateLimit } from '@/lib/rateLimit';
import { validateEmail, validatePassword } from '@/lib/validators';
import { Admin } from '@/models/Admin';
import { AuditEvent } from '@/models/AuditEvent';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  email: z.string().trim().max(120).transform(value => value.toLowerCase()),
  password: z.string().min(12).max(128),
}).strict().superRefine((value, context) => {
  if (!validateEmail(value.email).valid) {
    context.addIssue({ code: 'custom', path: ['email'], message: 'Enter a valid email address' });
  }
  for (const message of validatePassword(value.password).errors) {
    context.addIssue({ code: 'custom', path: ['password'], message });
  }
});

export async function GET(request: NextRequest) {
  const authorization = await authorizeAdminAccountManagement();
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }
  try {
    await connectToMongo();
    const pageInput = Number(request.nextUrl.searchParams.get('page') ?? 1);
    const page = Number.isSafeInteger(pageInput) ? Math.max(1, pageInput) : 1;
    const limit = 50;
    const [admins, total] = await Promise.all([
      Admin.find({}).select('email role permissions isActive createdAt').sort({ createdAt: 1, _id: 1 })
        .skip((page - 1) * limit).limit(limit).lean(),
      Admin.countDocuments({}),
    ]);
    return NextResponse.json({
      ok: true,
      admins: admins.map(admin => ({
        id: String(admin._id),
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions ?? [],
        isActive: admin.isActive !== false,
        createdAt: admin.createdAt,
      })),
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    logServerError({ route: 'GET /api/admin/admins', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'ADMINS_UNAVAILABLE' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeAdminAccountManagement();
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }
  try {
    const limited = await distributedRateLimit(`admin-account-create:${authorization.adminId}`, 10, 60);
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: 'TOO_MANY_REQUESTS' }, {
        status: 429,
        headers: { 'Retry-After': String(limited.retryAfter ?? 60) },
      });
    }
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
    }

    await connectToMongo();
    if (await Admin.exists({ email: parsed.data.email })) {
      return NextResponse.json({ ok: false, error: 'ADMIN_ALREADY_EXISTS' }, { status: 409 });
    }
    const admin = await Admin.create({
      email: parsed.data.email,
      password: await bcrypt.hash(parsed.data.password, 12),
      passwordVersion: 0,
      role: 'admin',
      permissions: ['*'],
      isActive: true,
    });
    await AuditEvent.create({
      actorType: 'admin', actorId: authorization.adminId, action: 'admin.create',
      resourceType: 'admin', resourceId: String(admin._id),
      correlationId: request.headers.get('x-request-id'), outcome: 'success',
      metadata: {},
    }).catch(() => undefined);
    return NextResponse.json({
      ok: true,
      admin: { id: String(admin._id), email: admin.email, isActive: admin.isActive, createdAt: admin.createdAt },
    }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      return NextResponse.json({ ok: false, error: 'ADMIN_ALREADY_EXISTS' }, { status: 409 });
    }
    logServerError({ route: 'POST /api/admin/admins', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'ADMIN_CREATE_FAILED' }, { status: 500 });
  }
}
