import type { ClientSession } from 'mongoose';
import { getFulfillmentCapabilities } from '@/lib/businessRules';
import { TokenCounter } from '@/models/TokenCounter';

export function businessDateKey(at: Date, timeZone = 'Asia/Kolkata'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function allocateOrderToken(session: ClientSession, at: Date) {
  const capabilities = getFulfillmentCapabilities();
  const businessDate = businessDateKey(at, capabilities.timeZone);
  const counterId = `${capabilities.locationId}:${businessDate}`;
  const counter = await TokenCounter.findOneAndUpdate(
    { _id: counterId },
    {
      $inc: { sequence: 1 },
      $setOnInsert: {
        locationId: capabilities.locationId,
        businessDate,
      },
    },
    { upsert: true, returnDocument: 'after', session },
  ).lean();
  if (!counter || !Number.isSafeInteger(counter.sequence) || counter.sequence < 1) {
    throw new Error('TOKEN_ALLOCATION_FAILED');
  }
  return {
    locationId: capabilities.locationId,
    locationName: capabilities.locationName,
    businessDate,
    sequence: counter.sequence,
    tokenNumber: `${capabilities.tokenPrefix}-${String(counter.sequence).padStart(4, '0')}`,
  };
}
