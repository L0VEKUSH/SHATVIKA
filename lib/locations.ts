export type CounterLocation = {
  id: string;
  name: string;
};

const LOCATION_ID_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

/** Canonical form used by workers, token counters, orders, queues, and reports. */
export function canonicalLocationId(value: string): string {
  const normalized = value.trim().toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/[-_]{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
  if (!normalized || normalized.length > 64 || !LOCATION_ID_PATTERN.test(normalized)) {
    throw new Error('INVALID_COUNTER_LOCATION_ID');
  }
  return normalized;
}

export function getCounterLocationConfiguration(
  source: Record<string, string | undefined> = process.env,
) {
  const configuredValue = source.COUNTER_LOCATION_ID?.trim();
  const explicit = Boolean(configuredValue);
  const id = canonicalLocationId(configuredValue || 'shatvika-corner');
  const name = source.COUNTER_LOCATION_NAME?.trim().slice(0, 120) || 'Shatvika Corner';
  return {
    location: { id, name } satisfies CounterLocation,
    explicit,
    warning: explicit
      ? null
      : 'COUNTER_LOCATION_ID is not explicitly configured; the safe local fallback shatvika-corner is active.',
  };
}

/** This deployment currently supports one physical counter, but callers use a catalog contract. */
export function getCounterLocationCatalog(
  source: Record<string, string | undefined> = process.env,
): CounterLocation[] {
  return [getCounterLocationConfiguration(source).location];
}

export function configuredCounterLocation(
  locationId: string,
  source: Record<string, string | undefined> = process.env,
): CounterLocation | null {
  let canonical: string;
  try {
    canonical = canonicalLocationId(locationId);
  } catch {
    return null;
  }
  return getCounterLocationCatalog(source).find(location => location.id === canonical) ?? null;
}
