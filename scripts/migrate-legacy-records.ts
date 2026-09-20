import { config } from 'dotenv';
import mongoose from 'mongoose';
import { connectToMongo } from '@/lib/mongoose';
import {
  legacyCouponPatch,
  legacyMenuItemPatch,
  legacyOrderPatch,
} from '@/lib/orders/legacyMigration';

config({ path: '.env.local' });
config();

const apply = process.argv.includes('--apply');
const requiredConfirmation = 'SHATVIKA_LEGACY_BACKFILL';
const databaseName = process.env.MONGODB_DB || '';

if (apply) {
  const safeDatabaseName = /(test|dev|development|local|staging)/i.test(databaseName);
  if (!safeDatabaseName || process.env.MIGRATION_CONFIRM !== requiredConfirmation) {
    throw new Error(
      `Apply refused. Use a non-production database name containing test/dev/local/staging and set MIGRATION_CONFIRM=${requiredConfirmation}.`,
    );
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Apply refused while NODE_ENV=production. Production migration requires a separately reviewed runbook.');
  }
}

type Planner = (record: Record<string, unknown>) => Record<string, unknown>;

async function processCollection(name: string, planner: Planner) {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection is unavailable');
  const collection = db.collection(name);
  const cursor = collection.find({}, { batchSize: 250 });
  let scanned = 0;
  let eligible = 0;
  let updated = 0;
  type BulkOperation = Parameters<typeof collection.bulkWrite>[0][number];
  let operations: BulkOperation[] = [];

  const flush = async () => {
    if (!operations.length) return;
    if (apply) {
      const result = await collection.bulkWrite(operations, { ordered: false });
      updated += result.modifiedCount;
    }
    operations = [];
  };

  for await (const record of cursor) {
    scanned += 1;
    const patch = planner(record);
    if (!Object.keys(patch).length) continue;
    eligible += 1;
    operations.push({ updateOne: { filter: { _id: record._id }, update: { $set: patch } } });
    if (operations.length >= 250) await flush();
  }
  await flush();
  return { scanned, eligible, updated: apply ? updated : 0 };
}

async function main() {
  await connectToMongo();
  const results = {
    mode: apply ? 'apply' : 'dry-run',
    database: databaseName || '(URI default)',
    orders: await processCollection('orders', legacyOrderPatch),
    menuItems: await processCollection('menuitems', legacyMenuItemPatch),
    coupons: await processCollection('coupons', legacyCouponPatch),
    limitations: [
      'Customer identity, costs, payment collection/refunds, and operational timestamps are not inferred.',
      'Unknown reservation state remains unknown; it is never compensated automatically.',
    ],
  };
  // Counts only: never print customer or order contents.
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`Legacy migration failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
