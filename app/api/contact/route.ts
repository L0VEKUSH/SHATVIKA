import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';
import { connectToMongo } from '@/lib/mongoose';
import { ContactMessage } from '@/models/ContactMessage';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

const contactSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(120),
  phone: z.string().max(20).optional(),
  subject: z.string().max(120).optional(),
  message: z.string().min(10).max(2000),
  website: z.string().optional(),
});

function sanitize(input: string): string {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
}

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  const rateCheck = checkRateLimit(clientIp, 5, 60 * 1000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { ok: false, error: 'RATE_LIMITED', retryAfter: rateCheck.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } }
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (parsed.data.website) {
    return NextResponse.json({ ok: false, error: 'SPAM' }, { status: 400 });
  }

  try {
    await connectToMongo();
    const { name, email, phone, subject, message } = parsed.data;
    await ContactMessage.create({
      name: sanitize(name.trim()),
      email: sanitize(email.trim().toLowerCase()),
      phone: phone ? sanitize(phone.trim()) : '',
      subject: sanitize((subject || 'General Inquiry').trim()),
      message: sanitize(message.trim()),
      status: 'new',
    });

    return NextResponse.json({ ok: true, message: 'Message received. We will get back to you soon.' });
  } catch (err) {
    console.error('[POST /api/contact]', err);
    return NextResponse.json({ ok: false, error: 'SUBMIT_FAILED' }, { status: 500 });
  }
}
