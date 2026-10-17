import { mergeCoverage, EMPTY, runs } from './metrics-core.mjs';

export function studyLevel(seconds) {
  return seconds === 0 ? 0 : seconds < 1800 ? 1 : seconds < 3600 ? 2 : seconds < 7200 ? 3 : 4;
}

// Chart data has its own fixed window, independent of timeline pagination.
export function hourlyStudy(hours, queue, since, today, timeZone) {
  const combined = { ...hours };
  for (const [id, row] of Object.entries(queue)) combined[id] = { ...row,
    coverage: mergeCoverage(hours[id]?.coverage || EMPTY, row.coverage) };
  const totals = Array(24).fill(0);
  const format = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' });
  for (const row of Object.values(combined)) {
    if (row.day < since || row.day > today) continue;
    for (const segment of runs(row).filter(s => s.kind === 'Study')) {
      for (let at = segment.start; at < segment.end;) {
        const stop = Math.min(segment.end, at + 60000 - at % 60000);
        totals[Number(format.format(at))] += (stop - at) / 1000;
        at = stop;
      }
    }
  }
  return totals;
}
