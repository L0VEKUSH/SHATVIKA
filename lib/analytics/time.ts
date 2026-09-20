import type { DatePreset, Granularity } from './contracts';

export const DEFAULT_BUSINESS_TIME_ZONE = 'Asia/Kolkata';

type LocalDate = { year: number; month: number; day: number };

const PARTS_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string) {
  let formatter = PARTS_FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    PARTS_FORMATTERS.set(timeZone, formatter);
  }
  return formatter;
}

export function assertTimeZone(timeZone: string) {
  try {
    partsFormatter(timeZone).format(new Date());
  } catch {
    throw new Error('INVALID_TIME_ZONE');
  }
}

function zonedParts(date: Date, timeZone: string) {
  const values: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(date)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function offsetAt(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  const representedAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return representedAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function localMidnightToUtc(local: LocalDate, timeZone: string) {
  assertTimeZone(timeZone);
  const wallClockAsUtc = Date.UTC(local.year, local.month - 1, local.day);
  let result = new Date(wallClockAsUtc - offsetAt(new Date(wallClockAsUtc), timeZone));
  result = new Date(wallClockAsUtc - offsetAt(result, timeZone));
  return result;
}

export function parseLocalDate(value: string): LocalDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('INVALID_DATE');
  const local = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const check = new Date(Date.UTC(local.year, local.month - 1, local.day));
  if (
    check.getUTCFullYear() !== local.year ||
    check.getUTCMonth() + 1 !== local.month ||
    check.getUTCDate() !== local.day
  ) throw new Error('INVALID_DATE');
  return local;
}

export function formatLocalDate(local: LocalDate) {
  return `${local.year.toString().padStart(4, '0')}-${local.month.toString().padStart(2, '0')}-${local.day.toString().padStart(2, '0')}`;
}

export function instantToLocalDate(date: Date, timeZone: string): LocalDate {
  const p = zonedParts(date, timeZone);
  return { year: p.year, month: p.month, day: p.day };
}

export function addLocalDays(local: LocalDate, amount: number): LocalDate {
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day + amount));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function addLocalMonths(local: LocalDate, amount: number): LocalDate {
  const date = new Date(Date.UTC(local.year, local.month - 1 + amount, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: 1 };
}

export function formatBusinessDate(date: Date, timeZone: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    ...(options ?? { day: '2-digit', month: 'short', year: 'numeric' }),
  }).format(date);
}

export function formatBusinessDateTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function resolveRange(args: {
  preset: DatePreset;
  from?: string;
  to?: string;
  now: Date;
  timeZone: string;
}) {
  const { preset, now, timeZone } = args;
  assertTimeZone(timeZone);
  const today = instantToLocalDate(now, timeZone);
  let fromLocal: LocalDate;
  let toLocal: LocalDate;
  let fixedComparison: { fromUtc: Date; toExclusiveUtc: Date } | null = null;

  if (preset === 'custom') {
    if (!args.from || !args.to) throw new Error('CUSTOM_RANGE_REQUIRED');
    fromLocal = parseLocalDate(args.from);
    toLocal = parseLocalDate(args.to);
  } else {
    toLocal = addLocalDays(today, 1);
    if (preset === 'today') fromLocal = today;
    else if (preset === 'yesterday') {
      fromLocal = addLocalDays(today, -1);
      toLocal = today;
      fixedComparison = {
        fromUtc: localMidnightToUtc(addLocalDays(today, -2), timeZone),
        toExclusiveUtc: localMidnightToUtc(addLocalDays(today, -1), timeZone),
      };
    }
    else if (preset === 'this_week') {
      fromLocal = mondayFor(today);
      const currentStart = localMidnightToUtc(fromLocal, timeZone);
      const previousStart = localMidnightToUtc(addLocalDays(fromLocal, -7), timeZone);
      fixedComparison = { fromUtc: previousStart, toExclusiveUtc: new Date(previousStart.getTime() + (now.getTime() - currentStart.getTime())) };
    }
    else if (preset === 'last_week') {
      const currentMonday = mondayFor(today);
      fromLocal = addLocalDays(currentMonday, -7);
      toLocal = currentMonday;
      fixedComparison = {
        fromUtc: localMidnightToUtc(addLocalDays(currentMonday, -14), timeZone),
        toExclusiveUtc: localMidnightToUtc(addLocalDays(currentMonday, -7), timeZone),
      };
    }
    else if (preset === 'this_month') {
      fromLocal = { year: today.year, month: today.month, day: 1 };
      const previousMonth = addLocalMonths(fromLocal, -1);
      const todayStart = localMidnightToUtc(today, timeZone);
      const intraDayMs = now.getTime() - todayStart.getTime();
      const previousEquivalentDay = addLocalDays(previousMonth, today.day - 1);
      const previousMonthEnd = localMidnightToUtc(fromLocal, timeZone);
      fixedComparison = {
        fromUtc: localMidnightToUtc(previousMonth, timeZone),
        toExclusiveUtc: new Date(Math.min(
          previousMonthEnd.getTime(),
          localMidnightToUtc(previousEquivalentDay, timeZone).getTime() + intraDayMs,
        )),
      };
    }
    else if (preset === 'last_month') {
      toLocal = { year: today.year, month: today.month, day: 1 };
      fromLocal = addLocalMonths(toLocal, -1);
      const previousMonth = addLocalMonths(fromLocal, -1);
      fixedComparison = {
        fromUtc: localMidnightToUtc(previousMonth, timeZone),
        toExclusiveUtc: localMidnightToUtc(fromLocal, timeZone),
      };
    }
    else if (preset === '7d') fromLocal = addLocalDays(today, -6);
    else if (preset === '30d') fromLocal = addLocalDays(today, -29);
    else if (preset === 'mtd') fromLocal = { year: today.year, month: today.month, day: 1 };
    else if (preset === '90d') fromLocal = addLocalDays(today, -89);
    else fromLocal = addLocalMonths({ year: today.year, month: today.month, day: 1 }, -11);
  }

  const rawFrom = localMidnightToUtc(fromLocal, timeZone);
  const rawTo = localMidnightToUtc(toLocal, timeZone);
  if (rawFrom >= rawTo) throw new Error('INVALID_RANGE');

  const toExclusiveUtc = rawTo > now ? new Date(now) : rawTo;
  if (rawFrom >= toExclusiveUtc) throw new Error('RANGE_IN_FUTURE');
  const durationMs = toExclusiveUtc.getTime() - rawFrom.getTime();
  const maxRangeMs = 366 * 24 * 60 * 60 * 1000;
  if (durationMs > maxRangeMs) throw new Error('RANGE_TOO_LARGE');

  return {
    from: formatLocalDate(fromLocal),
    to: formatLocalDate(toLocal),
    fromUtc: rawFrom,
    toExclusiveUtc,
    comparisonFromUtc: fixedComparison?.fromUtc ?? new Date(rawFrom.getTime() - durationMs),
    comparisonToExclusiveUtc: fixedComparison?.toExclusiveUtc ?? rawFrom,
  };
}

export function chooseGranularity(fromUtc: Date, toUtc: Date, requested?: Granularity): Granularity {
  if (requested) return requested;
  const days = (toUtc.getTime() - fromUtc.getTime()) / 86_400_000;
  if (days <= 45) return 'day';
  if (days <= 180) return 'week';
  return 'month';
}

function mondayFor(local: LocalDate) {
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const diff = (date.getUTCDay() + 6) % 7;
  return addLocalDays(local, -diff);
}

export function bucketKey(date: Date, granularity: Granularity, timeZone: string) {
  const local = instantToLocalDate(date, timeZone);
  if (granularity === 'month') return `${local.year}-${local.month.toString().padStart(2, '0')}`;
  const bucketLocal = granularity === 'week' ? mondayFor(local) : local;
  return formatLocalDate(bucketLocal);
}

export function buildBuckets(fromUtc: Date, toUtc: Date, granularity: Granularity, timeZone: string) {
  let local = instantToLocalDate(fromUtc, timeZone);
  if (granularity === 'week') local = mondayFor(local);
  if (granularity === 'month') local = { year: local.year, month: local.month, day: 1 };
  const buckets: Array<{ key: string; label: string }> = [];

  for (let guard = 0; guard < 400; guard += 1) {
    const start = localMidnightToUtc(local, timeZone);
    if (start >= toUtc) break;
    const key = granularity === 'month'
      ? `${local.year}-${local.month.toString().padStart(2, '0')}`
      : formatLocalDate(local);
    const label = granularity === 'day'
      ? formatBusinessDate(start, timeZone, { day: '2-digit', month: 'short' })
      : granularity === 'week'
        ? `Week of ${formatBusinessDate(start, timeZone, { day: '2-digit', month: 'short' })}`
        : formatBusinessDate(start, timeZone, { month: 'short', year: 'numeric' });
    buckets.push({ key, label });
    local = granularity === 'month' ? addLocalMonths(local, 1) : addLocalDays(local, granularity === 'week' ? 7 : 1);
  }
  return buckets;
}

export function businessHour(date: Date, timeZone: string) {
  return zonedParts(date, timeZone).hour;
}

export function businessWeekday(date: Date, timeZone: string) {
  const local = instantToLocalDate(date, timeZone);
  return new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
}
