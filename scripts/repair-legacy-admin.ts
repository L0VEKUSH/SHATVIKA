import { config } from 'dotenv';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';

config({ path: '.env.local', quiet: true });
config({ quiet: true });

const apply = process.argv.includes('--apply');
const requiredConfirmation = 'BACKFILL_CONFIGURED_ADMIN_ROLE';

type RepairStatus =
  | 'eligible'
  | 'already-compatible'
  | 'not-found'
  | 'inactive'
  | 'password-mismatch'
  | 'not-eligible';

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env.local.');
  }
  if (apply && process.env.ADMIN_REPAIR_CONFIRM !== requiredConfirmation) {
    throw new Error(`Apply refused. Set ADMIN_REPAIR_CONFIRM=${requiredConfirmation} for this command only.`);
  }

  const [{ connectToMongo }, { Admin }, { AuditEvent }] = await Promise.all([
    import('../lib/mongoose'),
    import('../models/Admin'),
    import('../models/AuditEvent'),
  ]);
  await connectToMongo();

  const existing = await Admin.collection.findOne(
    { email },
    { projection: { password: 1, role: 1, permissions: 1, isActive: 1 } },
  );
  let status: RepairStatus = 'eligible';
  if (!existing) status = 'not-found';
  else if (existing.isActive === false) status = 'inactive';
  else if (typeof existing.password !== 'string' || !(await bcrypt.compare(password, existing.password))) {
    status = 'password-mismatch';
  } else if (existing.role === 'admin' && existing.permissions?.includes('*')) {
    status = 'already-compatible';
  } else if (existing.role !== undefined || existing.permissions !== undefined) {
    status = 'not-eligible';
  }

  if (status !== 'eligible') {
    process.stdout.write(`${JSON.stringify({ mode: apply ? 'apply' : 'dry-run', status, modifiedCount: 0 })}\n`);
    if (status !== 'already-compatible') process.exitCode = 1;
    return;
  }
  if (!existing) throw new Error('Invariant failed while selecting the configured admin.');
  if (!apply) {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', status, modifiedCount: 0 })}\n`);
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const update = await Admin.collection.updateOne(
        {
          _id: existing._id,
          isActive: { $ne: false },
          role: { $exists: false },
          permissions: { $exists: false },
        },
        { $set: { role: 'admin', permissions: ['*'] } },
        { session },
      );
      if (update.modifiedCount !== 1) {
        throw new Error('Guarded admin update did not modify exactly one record.');
      }
      await AuditEvent.create(
        [
          {
            actorType: 'system',
            actorId: null,
            action: 'admin_legacy_role_backfill',
            resourceType: 'Admin',
            resourceId: String(existing._id),
            correlationId: null,
            outcome: 'success',
            metadata: {
              fields: ['role', 'permissions'],
              source: 'guarded_local_repair',
            },
            occurredAt: new Date(),
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  const verified = await Admin.collection.findOne(
    { _id: existing._id },
    { projection: { role: 1, permissions: 1, isActive: 1 } },
  );
  const repaired =
    verified?.role === 'admin' && verified.permissions?.includes('*') && verified.isActive !== false;
  if (!repaired) throw new Error('The committed repair could not be verified.');
  process.stdout.write(
    `${JSON.stringify({ mode: 'apply', status: 'repaired', modifiedCount: 1, auditRecorded: true })}\n`,
  );
}

main()
  .catch((error) => {
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: error instanceof Error ? error.name : 'RepairError' })}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => undefined);
  });
