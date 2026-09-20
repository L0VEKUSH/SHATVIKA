import { config } from 'dotenv';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';

config({ path: '.env.local' });
config();

async function main() {
  const name = process.env.WORKER_NAME?.trim() ?? '';
  const email = process.env.WORKER_EMAIL?.trim().toLowerCase() ?? '';
  const password = process.env.WORKER_PASSWORD ?? '';
  const locationId = process.env.COUNTER_LOCATION_ID?.trim() || 'shatvika-corner';
  if (process.env.WORKER_PROVISION_CONFIRM !== 'CREATE_COUNTER_WORKER') {
    throw new Error('Set WORKER_PROVISION_CONFIRM=CREATE_COUNTER_WORKER for this one provisioning command.');
  }
  if (name.length < 2 || name.length > 120) throw new Error('WORKER_NAME must contain 2-120 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw new Error('WORKER_EMAIL is invalid.');
  if (password.length < 12 || password.length > 128) throw new Error('WORKER_PASSWORD must contain 12-128 characters.');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');

  const [{ connectToMongo }, { Worker }] = await Promise.all([
    import('../lib/mongoose'),
    import('../models/Worker'),
  ]);
  await connectToMongo();
  if (await Worker.exists({ email })) throw new Error('A worker with this email already exists; no changes were made.');
  const passwordHash = await bcrypt.hash(password, 12);
  const worker = await Worker.create({
    name,
    email,
    password: passwordHash,
    role: 'worker',
    locationId,
    permissions: ['counter:operate'],
    isActive: true,
  });
  process.stdout.write(`Created counter worker ${String(worker._id)} at location ${locationId}.\n`);
}

main()
  .catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Worker provisioning failed'}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => undefined);
  });
