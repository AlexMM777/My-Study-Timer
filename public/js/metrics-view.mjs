import { counts, dayKey, EMPTY, mergeCoverage, runs, shiftDay, streaks, weekStart } from './metrics-core.mjs';
import { hourlyStudy, studyLevel } from './stats-model.mjs';
export function timeLabel(seconds) {
  if (seconds > 0 && seconds < 60) return '<1m';
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}
function el(tag, text, className) {
  const node = document.createElement(tag); if (text !== undefined) node.textContent = text;
  if (className) node.className = className; return node;
}
export function renderStats({ profile, days, hours, queue, base, patternHours = {} }) {
  const focused = document.activeElement?.id;
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
    card.append(el('span', title), el('strong', timeLabel(values.study)), el('span', 'time spent studying'), el('small', `${timeLabel(values.break)} breaks · ${timeLabel(values.pause)} paused`)); totals.append(card);
  }
  document.getElementById('statsContext').textContent = `Times shown in ${profile.timeZone}. Weeks run Monday–Sunday.`;
  document.getElementById('goalProgress').value = Math.min(1, week.study / profile.weeklyGoal);
  document.getElementById('goalText').textContent = `${timeLabel(week.study)} of ${timeLabel(profile.weeklyGoal)} · ${Math.round(week.study / profile.weeklyGoal * 100)}% of your weekly goal`;
  const chart = document.getElementById('dailyChart'); chart.replaceChildren();
  const last7 = Array.from({length:7}, (_, i) => shiftDay(today, i - 6));
  const max = Math.max(3600, ...last7.map(d => daily[d]?.study || 0));
  for (const day of last7) {
    const value = daily[day]?.study || 0, column = el('div', undefined, 'chart-day');
    const bar = el('div', undefined, 'chart-bar'); bar.style.height = `${value / max * 100}px`;
    const date = new Date(`${day}T12:00:00Z`);
    column.title = `${day}: ${timeLabel(value)}`; column.append(el('span', timeLabel(value)), bar,
      el('strong', new Intl.DateTimeFormat(undefined, {weekday:'short', timeZone:'UTC'}).format(date)), el('span', `${date.getUTCMonth()+1}/${date.getUTCDate()}`)); chart.append(column);
  }
  const heatmap = document.getElementById('heatmap');
  const since = shiftDay(today, -89);
  let selected = heatmap.dataset.selected || today;
  if (selected < since || selected > today) selected = today;
  let month = heatmap.dataset.month || today.slice(0,7);
  if (month < since.slice(0,7) || month > today.slice(0,7)) month = today.slice(0,7);
  function drawCalendar() {
    heatmap.dataset.month = month; heatmap.dataset.selected = selected; heatmap.replaceChildren();
    const header = el('div', undefined, 'calendar-header');
    const monthDate = new Date(`${month}-01T12:00:00Z`);
    const title = el('strong', new Intl.DateTimeFormat(undefined, {month:'long',year:'numeric',timeZone:'UTC'}).format(monthDate));
    const move = (offset, label) => {
      const button = el('button', offset < 0 ? '‹' : '›'); button.type = 'button'; button.id = offset < 0 ? 'calendarPrev' : 'calendarNext';
      button.setAttribute('aria-label', label);
      button.disabled = offset < 0 ? month <= since.slice(0,7) : month >= today.slice(0,7);
      button.onclick = () => { const next = new Date(monthDate); next.setUTCMonth(next.getUTCMonth()+offset); month = next.toISOString().slice(0,7); drawCalendar(); document.getElementById(button.id)?.focus({preventScroll:true}); };
      return button;
    };
    header.append(move(-1,'Previous month'), title, move(1,'Next month')); heatmap.append(header);
    const grid = el('div', undefined, 'calendar-grid');
    for (const weekday of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']) grid.append(el('span',weekday,'weekday'));
    for (let i=0; i<(monthDate.getUTCDay()+6)%7; i++) grid.append(el('span'));
    const end = new Date(Date.UTC(monthDate.getUTCFullYear(),monthDate.getUTCMonth()+1,0)).getUTCDate();
    for (let n=1; n<=end; n++) {
      const day = `${month}-${String(n).padStart(2,'0')}`, value = daily[day]?.study || 0;
      const button = el('button', String(n), 'heat-cell'); button.id = `day-${day}`; button.type = 'button';
      button.disabled = day < since || day > today; button.dataset.level = studyLevel(value);
      button.setAttribute('aria-label', `${day}: ${timeLabel(value)} studied${day === today ? ', today' : ''}`);
      button.setAttribute('aria-pressed', String(day === selected));
      if (day === today) button.setAttribute('aria-current','date');
      button.onclick = () => { selected = day; drawCalendar(); document.getElementById(button.id)?.focus({preventScroll:true}); };
      grid.append(button);
    }
    heatmap.append(grid);
    const value = daily[selected] || zero;
    document.getElementById('calendarDetail').textContent = `${new Intl.DateTimeFormat(undefined, {month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${selected}T12:00Z`))} · ${timeLabel(value.study)} studied · ${timeLabel(value.break)} breaks · ${timeLabel(value.pause)} paused`;
  }
  drawCalendar();
  const streak = streaks(rows, today);
  document.getElementById('streakText').textContent = `${streak.current}-day current streak · ${streak.longest}-day longest streak · 10 study minutes qualifies a day`;
  const segments = Object.values(history).flatMap(runs).sort((a,b) => a.start - b.start);
  const mergedRuns = [];
  for (const segment of segments) {
    const last = mergedRuns.at(-1);
    if (last && last.kind === segment.kind && last.end === segment.start && dayKey(last.start,profile.timeZone) === dayKey(segment.start,profile.timeZone)) last.end = segment.end;
    else mergedRuns.push({ ...segment });
  }
  const patternSince = shiftDay(today,-29);
  const timeOfDay = hourlyStudy(patternHours, queue, patternSince, today, profile.timeZone);
  document.getElementById('patternContext').textContent = `Last 30 days · ${patternSince} to ${today} · ${profile.timeZone}`;
  const hourChart = document.getElementById('hourChart'); hourChart.replaceChildren();
  const hourMax = Math.max(60, Math.ceil(Math.max(...timeOfDay) / 60) * 60);
  const axis = el('div',undefined,'chart-axis'); axis.append(el('span',timeLabel(hourMax)), el('span',timeLabel(hourMax/2)),el('span','0m')); hourChart.append(axis);
  const hourName = hour => `${hour % 12 || 12}${hour < 12 ? 'am' : 'pm'}`;
  let chosen = Number(hourChart.dataset.selected ?? timeOfDay.indexOf(Math.max(...timeOfDay)));
  const describe = hour => {
    hourChart.dataset.selected = hour;
    document.getElementById('hourDetail').textContent = `${hourName(hour)}–${hourName((hour+1)%24)} · ${timeLabel(timeOfDay[hour])} studied over the last 30 days`;
    for (const button of hourChart.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.id === `hour-${hour}`));
  };
  timeOfDay.forEach((value, hour) => {
    const column = el('div',undefined,'hour-column');
    const button = el('button', undefined, 'hour-button'); button.type = 'button'; button.id = `hour-${hour}`;
    button.setAttribute('aria-label', `${hourName(hour)} to ${hourName((hour+1)%24)}: ${timeLabel(value)} studied`);
    const bar = el('span', undefined, 'hour-bar'); bar.style.height = `${value / hourMax * 100}%`; button.append(bar);
    button.onclick = () => describe(hour); button.onfocus = () => describe(hour);
    column.append(button,el('span', hour % 3 === 0 ? hourName(hour) : '', 'hour-label')); hourChart.append(column);
  });
  describe(chosen);
  if (!timeOfDay.some(Boolean)) document.getElementById('hourDetail').textContent = 'No study time yet in the last 30 days. Your first session will start your daily pattern.';
  const timeline = document.getElementById('activityHistory'); timeline.replaceChildren();
  const stamp = new Intl.DateTimeFormat(undefined, { timeZone: profile.timeZone, hour: 'numeric', minute: '2-digit' });
  let lastDay;
  for (const segment of mergedRuns.reverse()) {
    const day = dayKey(segment.start, profile.timeZone);
    if (day !== lastDay) {
      timeline.append(el('h4', day === today ? 'Today' : day === shiftDay(today,-1) ? 'Yesterday' : new Intl.DateTimeFormat(undefined,{month:'long',day:'numeric',year:'numeric',timeZone:profile.timeZone}).format(segment.start)));
      lastDay = day;
    }
    const row = el('div', undefined, 'activity-row');
    const nextDay = dayKey(segment.end,profile.timeZone) !== day ? ' (next day)' : '';
    row.append(el('strong', segment.kind), el('span', `${stamp.format(segment.start)} – ${stamp.format(segment.end)}${nextDay}`), el('span', timeLabel((segment.end - segment.start) / 1000))); timeline.append(row);
  }
  if (!mergedRuns.length) timeline.append(el('p', 'Your first study session will appear here.'));
  if (focused) document.getElementById(focused)?.focus({preventScroll:true});
}
