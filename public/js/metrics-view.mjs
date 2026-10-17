import { counts, dayKey, EMPTY, mergeCoverage, runs, shiftDay, streaks, weekStart } from './metrics-core.mjs';
export function timeLabel(seconds) {
  if (seconds > 0 && seconds < 60) return '<1m';
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}
function el(tag, text, className) {
  const node = document.createElement(tag); if (text !== undefined) node.textContent = text;
  if (className) node.className = className; return node;
}
export function renderStats({ profile, days, hours, queue, base }) {
  const today = dayKey(Date.now(), profile.timeZone), monday = weekStart(today);
  const daily = Object.fromEntries(days.map(d => [d.day, { ...d }]));
  const history = { ...hours };
  for (const [id, entry] of Object.entries(queue)) {
    const before = base[id] || hours[id]?.coverage || EMPTY, merged = mergeCoverage(before, entry.coverage);
    const oldCounts = counts(before), newCounts = counts(merged);
    daily[entry.day] ||= { day: entry.day, study: 0, break: 0, pause: 0 };
    for (const kind of ['study', 'break', 'pause']) daily[entry.day][kind] += newCounts[kind] - oldCounts[kind];
    history[id] = { ...entry, coverage: merged };
  }
  const rows = Object.values(daily), zero = { study: 0, break: 0, pause: 0 };
  const sum = values => values.reduce((a, b) => ({ study: a.study + b.study, break: a.break + b.break, pause: a.pause + b.pause }), { ...zero });
  const week = sum(rows.filter(d => d.day >= monday && d.day <= today));
  const cards = [['Today', daily[today] || zero], ['This week', week], ['All time', sum(rows)]];
  const totals = document.getElementById('statsTotals'); totals.replaceChildren();
  for (const [title, values] of cards) {
    const card = el('div', undefined, 'stat-card');
    card.append(el('span', title), el('strong', timeLabel(values.study)), el('span', `study · ${timeLabel(values.break)} break · ${timeLabel(values.pause)} pause`)); totals.append(card);
  }
  document.getElementById('statsContext').textContent = `Times shown in ${profile.timeZone}. Weeks run Monday–Sunday.`;
  document.getElementById('goalProgress').value = Math.min(1, week.study / profile.weeklyGoal);
  document.getElementById('goalText').textContent = `${timeLabel(week.study)} of ${timeLabel(profile.weeklyGoal)} this week`;
  const chart = document.getElementById('dailyChart'); chart.replaceChildren();
  const last7 = Array.from({length:7}, (_, i) => shiftDay(today, i - 6));
  const max = Math.max(3600, ...last7.map(d => daily[d]?.study || 0));
  for (const day of last7) {
    const value = daily[day]?.study || 0, column = el('div', undefined, 'chart-day');
    const bar = el('div', undefined, 'chart-bar'); bar.style.height = `${value / max * 100}px`;
    column.title = `${day}: ${timeLabel(value)}`; column.append(el('span', timeLabel(value)), bar, el('span', day.slice(5))); chart.append(column);
  }
  const heatmap = document.getElementById('heatmap'); heatmap.replaceChildren();
  for (let i = -89; i <= 0; i++) {
    const day = shiftDay(today, i), value = daily[day]?.study || 0;
    const cell = el('div', undefined, 'heat-cell');
    cell.style.background = value < 600 ? '#30372c' : value < 3600 ? '#626e4c' : value < 7200 ? '#9aa77c' : '#c5d5a3';
    cell.title = `${day}: ${timeLabel(value)}`; cell.setAttribute('aria-label', cell.title); heatmap.append(cell);
  }
  const streak = streaks(rows, today);
  document.getElementById('streakText').textContent = `${streak.current}-day current streak · ${streak.longest}-day longest streak · 10 study minutes qualifies a day`;
  const segments = Object.values(history).flatMap(runs).sort((a,b) => a.start - b.start);
  const mergedRuns = [];
  for (const segment of segments) {
    const last = mergedRuns.at(-1);
    if (last && last.kind === segment.kind && last.end === segment.start) last.end = segment.end;
    else mergedRuns.push({ ...segment });
  }
  const timeOfDay = Array(24).fill(0);
  const hourFormat = new Intl.DateTimeFormat('en-US', { timeZone: profile.timeZone, hour: 'numeric', hourCycle: 'h23' });
  for (const segment of mergedRuns.filter(s => s.kind === 'Study')) {
    for (let at = segment.start; at < segment.end;) {
      const stop = Math.min(segment.end, at + 60_000 - at % 60_000);
      timeOfDay[Number(hourFormat.format(at))] += (stop - at) / 1000; at = stop;
    }
  }
  const hourChart = document.getElementById('hourChart'); hourChart.replaceChildren();
  const hourMax = Math.max(1, ...timeOfDay);
  timeOfDay.forEach((value, hour) => {
    const bar = el('div', undefined, 'hour-bar'); bar.style.height = `${value / hourMax * 85}%`;
    bar.title = `${hour}:00 — ${timeLabel(value)}`; bar.setAttribute('aria-label', bar.title); hourChart.append(bar);
  });
  const timeline = document.getElementById('activityHistory'); timeline.replaceChildren();
  const stamp = new Intl.DateTimeFormat(undefined, { timeZone: profile.timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  for (const segment of mergedRuns.reverse()) {
    const row = el('div', undefined, 'activity-row');
    row.append(el('strong', segment.kind), el('span', `${stamp.format(segment.start)} – ${stamp.format(segment.end)}`), el('span', timeLabel((segment.end - segment.start) / 1000))); timeline.append(row);
  }
  if (!mergedRuns.length) timeline.append(el('p', 'Your first study session will appear here.'));
}
