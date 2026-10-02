/** Intervalo semiabierto [start, end) en ms. */
export interface Interval {
  readonly start: number;
  readonly end: number;
}

export const overlaps = (a: Interval, b: Interval): boolean => a.start < b.end && b.start < a.end;

export const duration = (i: Interval): number => i.end - i.start;

/** Ordena y fusiona intervalos solapados o contiguos. */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  return sorted.reduce<Interval[]>((acc, cur) => {
    const last = acc.at(-1);
    if (last && cur.start <= last.end) {
      return [...acc.slice(0, -1), { start: last.start, end: Math.max(last.end, cur.end) }];
    }
    return [...acc, cur];
  }, []);
}

/** Resta `busy` de `base`: devuelve los tramos de `base` no cubiertos. */
export function subtractIntervals(base: readonly Interval[], busy: readonly Interval[]): Interval[] {
  const blockers = mergeIntervals(busy);
  return mergeIntervals(base).flatMap((free) => {
    const pieces: Interval[] = [];
    let cursor = free.start;
    for (const b of blockers) {
      if (b.end <= cursor || b.start >= free.end) continue;
      if (b.start > cursor) pieces.push({ start: cursor, end: b.start });
      cursor = Math.max(cursor, b.end);
      if (cursor >= free.end) break;
    }
    if (cursor < free.end) pieces.push({ start: cursor, end: free.end });
    return pieces;
  });
}

export function clipInterval(i: Interval, bounds: Interval): Interval | undefined {
  const start = Math.max(i.start, bounds.start);
  const end = Math.min(i.end, bounds.end);
  return end > start ? { start, end } : undefined;
}

export const totalDuration = (intervals: readonly Interval[]): number =>
  mergeIntervals(intervals).reduce((sum, i) => sum + duration(i), 0);
