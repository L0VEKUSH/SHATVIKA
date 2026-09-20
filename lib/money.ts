/**
 * Monetary values are persisted and calculated as integer paise.
 * Display-only legacy rupee fields are derived at the API boundary.
 * Positive fractional paise are rounded half-up exactly once when converting
 * an owner-configured rupee value or percentage result.
 */
export const MAX_MONEY_PAISE = 100_000_000_000;

export function assertPaise(value: unknown, field = 'amount'): number {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_MONEY_PAISE) {
    throw new Error(`${field} must be a non-negative integer number of paise`);
  }
  return amount;
}

export function rupeesToPaise(value: unknown, field = 'amount'): number {
  if (typeof value === 'string' && !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) {
    throw new Error(`${field} must have at most two decimal places`);
  }
  const rupees = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(rupees) || rupees < 0) {
    throw new Error(`${field} must be a non-negative monetary value`);
  }
  return assertPaise(Math.round((rupees + Number.EPSILON) * 100), field);
}

export function paiseToRupees(value: number): number {
  return assertPaise(value) / 100;
}

export function percentageOfPaise(amountPaise: number, percentageBasisPoints: number): number {
  assertPaise(amountPaise);
  if (!Number.isSafeInteger(percentageBasisPoints) || percentageBasisPoints < 0 || percentageBasisPoints > 10000) {
    throw new Error('percentageBasisPoints must be an integer from 0 to 10000');
  }
  return Math.floor((amountPaise * percentageBasisPoints + 5000) / 10000);
}

export function legacyRupeesOrPaise(paise: unknown, rupees: unknown, field: string): number {
  if (typeof paise === 'number' && Number.isSafeInteger(paise) && paise >= 0) return paise;
  return rupeesToPaise(rupees ?? 0, field);
}
