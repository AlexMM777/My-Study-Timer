import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TimerEngine } from '../public/js/timer-engine.mjs';
import { addSpan, counts, EMPTY, mergeCoverage, runs, streaks, dayKey } from '../public/js/metrics-core.mjs';
import { openLocal, readLocal, writeLocal } from '../public/js/metrics-local.mjs';
import { indexedDB } from 'fake-indexeddb';

function clock(options = {}) {
  let now = Date.UTC(2026, 9, 17, 10); const events = [];
  const timer = new TimerEngine({ ...options, now: () => now, emit: e => events.push(e) });
  return { timer, events, advance(ms, step = 1000) {
    while (ms > 0) { const part = Math.min(ms, step); now += part; timer.tick(); ms -= part; }
  } };
}
function durations(events) {
  return events.filter(e => e.span).reduce((a,e) => { a[e.span.kind] = (a[e.span.kind] || 0) + e.span.end - e.span.start; return a; }, {});
}
test('timestamps handle minute-throttled background callbacks and exact automatic phases', () => {
  const c = clock({ work: 1, short: 1, long: 2, cycles: 2, autoStartWork: true });
  c.timer.toggle(); c.advance(240000, 60000);
  assert.deepEqual(durations(c.events), { study: 120000, break: 120000 });
  assert.equal(c.timer.phase, 'long'); assert.equal(c.timer.remaining, 60000);
  assert.equal(c.events.filter(e => e.kind === 'phase').length, 3);
});
test('work 25m, pause 5m, work 10m counts 35m study and 5m pause', () => {
  const c = clock(); c.timer.toggle(); c.advance(25*60000); c.timer.toggle();
  c.advance(5*60000); c.timer.toggle(); c.advance(10*60000);
  assert.deepEqual(durations(c.events), { study: 35*60000, pause: 5*60000 });
});
test('initial idle/reset idle are excluded; pause cap does not reset on phase switches', () => {
  const c = clock(); c.advance(60000); c.timer.toggle(); c.advance(60000); c.timer.toggle();
  c.advance(20*60000); c.timer.jump('short'); c.advance(20*60000); c.timer.reset(); c.advance(60000);
  assert.deepEqual(durations(c.events), { study: 60000, pause: 30*60000 });
});
test('sleep gap is not backfilled, recovery pauses, invalid preferences cannot loop', () => {
  const c = clock({ work: -1, short: 0 }); c.timer.toggle(); c.advance(5000); c.advance(300000, 300000);
  assert.equal(c.timer.paused, true); assert.deepEqual(durations(c.events), { study: 5000 });
  const fresh = clock(); assert.equal(fresh.timer.restore(c.timer.snapshot()), true);
  assert.equal(fresh.timer.paused, true); assert.equal(fresh.timer.remaining, 50*60000-5000);
});
test('device overlap and old retries are idempotent with study > break > pause', () => {
  const a = {}, b = {}, start = Date.UTC(2026,9,17,10);
  addSpan(a, {kind:'study',start,end:start+30*60000}, 'UTC');
  addSpan(b, {kind:'study',start:start+15*60000,end:start+45*60000}, 'UTC');
  const id = Object.keys(a)[0], merged = mergeCoverage(a[id].coverage,b[id].coverage);
  assert.equal(counts(merged).study, 45*60); assert.equal(mergeCoverage(merged,a[id].coverage), merged);
  const pause = {}; addSpan(pause, {kind:'pause',start,end:start+60*60000}, 'UTC');
  assert.deepEqual(counts(mergeCoverage(merged,pause[id].coverage)), {study:2700,break:0,pause:900});
  assert.equal(runs({...a[id],coverage:merged})[0].end,start+45*60000);
});
test('local midnight splits correctly in fractional offsets and daylight-saving transitions', () => {
  const q={}; const start=Date.parse('2026-10-17T18:20:00Z');
  addSpan(q,{kind:'study',start,end:start+20*60000},'Asia/Kolkata');
  assert.equal(Object.keys(q).length,2);
  assert.deepEqual(Object.values(q).map(x=>counts(x.coverage).study),[600,600]);
  const fall={}; const at=Date.parse('2026-11-01T05:00:00Z');
  addSpan(fall,{kind:'study',start:at,end:at+25*3600000},'America/Chicago');
  assert.equal(new Set(Object.values(fall).map(x=>x.day)).size,1);
  assert.equal(Object.values(fall).reduce((n,x)=>n+counts(x.coverage).study,0),90000);
  assert.equal(dayKey(at,'America/Chicago'),'2026-11-01');
});
test('streak threshold and pending local accounts remain isolated across reopening', async () => {
  assert.deepEqual(streaks([{day:'2026-10-15',study:600},{day:'2026-10-16',study:600},{day:'2026-10-17',study:599}], '2026-10-17'),{current:2,longest:2});
  const db=await openLocal(indexedDB); await writeLocal(db,'alice',{queue:{one:{coverage:EMPTY}}}); db.close();
  const reopened=await openLocal(indexedDB);
  assert.equal(Object.keys((await readLocal(reopened,'alice')).queue).length,1);
  assert.deepEqual((await readLocal(reopened,'bob')).queue,{}); reopened.close();
});
import { hourlyStudy, studyLevel } from '../public/js/stats-model.mjs';

test('study chart excludes older days, unions pending activity, and uses account timezone', () => {
  const rows = {}, pending = {};
  const start = Date.UTC(2026,9,17,14);
  addSpan(rows,{kind:'study',start,end:start+1800000},'America/Chicago');
  addSpan(pending,{kind:'study',start:start+900000,end:start+2700000},'America/Chicago');
  addSpan(rows,{kind:'study',start:Date.UTC(2026,8,1,14),end:Date.UTC(2026,8,1,15)},'America/Chicago');
  const values = hourlyStudy(rows,pending,'2026-09-18','2026-10-17','America/Chicago');
  assert.equal(values[9],2700); assert.equal(values.reduce((a,b)=>a+b,0),2700);
  assert.deepEqual([0,1,1799,1800,3599,3600,7199,7200].map(studyLevel),[0,1,1,2,2,3,3,4]);
});

for (const kind of ['short', 'long']) test(`${kind} break waits for Start by default and idle time is excluded`, () => {
  const c = clock({work:1,short:1,long:1});
  c.timer.jump(kind); c.timer.toggle();
  c.advance(90000,90000);
  assert.equal(c.timer.phase,'work'); assert.equal(c.timer.paused,true);
  assert.equal(c.timer.remaining,60000);
  c.advance(300000);
  assert.deepEqual(durations(c.events),{break:60000});
  c.timer.toggle(); c.advance(10000);
  assert.equal(c.timer.paused,false); assert.equal(c.timer.remaining,50000);
  assert.deepEqual(durations(c.events),{break:60000,study:10000});
});
test('automatic mode resumes work after both short and long breaks', () => {
  for (const kind of ['short','long']) {
    const c=clock({work:1,short:1,long:1,autoStartWork:true});
    c.timer.jump(kind); c.timer.toggle(); c.advance(90000,90000);
    assert.equal(c.timer.phase,'work'); assert.equal(c.timer.paused,false);
    assert.deepEqual(durations(c.events),{break:60000,study:30000});
  }
});
