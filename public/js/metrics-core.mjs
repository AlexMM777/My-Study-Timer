export const EMPTY = '0'.repeat(3600);
const codes = { pause: '1', break: '2', study: '3' };
const formatters = new Map();
export function dayKey(time, zone) {
  if (!formatters.has(zone)) formatters.set(zone, new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
  }));
  const parts = Object.fromEntries(formatters.get(zone).formatToParts(time).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function mergeCoverage(a = EMPTY, b = EMPTY) {
  if (a.length !== 3600 || b.length !== 3600) throw new Error('Invalid coverage length');
  return Array.from(a, (value, i) => value > b[i] ? value : b[i]).join('');
}
export function counts(coverage) {
  const result = { study: 0, break: 0, pause: 0 };
  for (const value of coverage) {
    if (value === '3') result.study++; else if (value === '2') result.break++; else if (value === '1') result.pause++;
  }
  return result;
}
// UTC-hour shards are also split at the account's local midnight (including half-hour offsets).
export function addSpan(queue, span, zone) {
  const code = codes[span.kind];
  if (!code || span.end <= span.start) return;
  let second = Math.floor(span.start / 1000);
  const end = Math.floor(span.end / 1000);
  while (second < end) {
    const hourStart = Math.floor(second / 3600) * 3_600_000;
    const day = dayKey(second * 1000, zone);
    let stop = Math.min(end, hourStart / 1000 + 3600);
    if (dayKey((stop - 1) * 1000, zone) !== day) {
      let low = second, high = stop;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (dayKey(mid * 1000, zone) === day) low = mid + 1; else high = mid;
      }
      stop = low;
    }
    const id = `${day}_${hourStart}`;
    const entry = queue[id] || { hourStart, day, coverage: EMPTY };
    const cells = entry.coverage.split('');
    for (let s = second; s < stop; s++) {
      const i = s - hourStart / 1000;
      if (code > cells[i]) cells[i] = code;
    }
    queue[id] = { ...entry, coverage: cells.join('') };
    second = stop;
  }
}
export function runs(hour) {
  const result = []; let start = 0;
  for (let i = 1; i <= 3600; i++) {
    if (hour.coverage[i] !== hour.coverage[start]) {
      const code = hour.coverage[start];
      if (code !== '0') result.push({ kind: { 1: 'Pause', 2: 'Break', 3: 'Study' }[code],
        start: hour.hourStart + start * 1000, end: hour.hourStart + i * 1000 });
      start = i;
    }
  }
  return result;
}
export function shiftDay(day, amount) {
  const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function weekStart(day) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return shiftDay(day, -((weekday + 6) % 7));
}
export function streaks(days, today) {
  const qualified = new Set(days.filter(d => d.study >= 600).map(d => d.day));
  let current = 0, day = qualified.has(today) ? today : shiftDay(today, -1);
  while (qualified.has(day)) { current++; day = shiftDay(day, -1); }
  let longest = 0, run = 0, previous;
  for (const key of [...qualified].sort()) {
    run = previous && shiftDay(previous, 1) === key ? run + 1 : 1;
    longest = Math.max(longest, run); previous = key;
  }
  return { current, longest };
}
