import { afterEach, beforeAll } from 'vitest';

/**
 * Tests must never inherit an application database connection. Integration
 * suites opt in by assigning the URI created by MongoMemoryReplSet.
 */
beforeAll(() => {
  delete process.env.MONGODB_URI;
  delete process.env.MONGODB_DB;
  Object.assign(process.env, { NODE_ENV: 'test' });
});

afterEach(() => {
  // Business-rule tests intentionally modify these values per case.
  delete process.env.TAX_RATE_BASIS_POINTS;
  delete process.env.DELIVERY_FEE_PAISE;
  delete process.env.FREE_DELIVERY_THRESHOLD_PAISE;
  delete process.env.SERVICEABLE_POSTAL_CODES;
  delete process.env.MAX_QUANTITY_PER_ITEM;
  delete process.env.TARGET_DELIVERY_MINUTES;
});
