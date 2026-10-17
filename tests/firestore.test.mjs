import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { cloudStore } from '../public/js/metrics-cloud.mjs';
import { addSpan, counts, EMPTY } from '../public/js/metrics-core.mjs';
let env;
before(async () => { env = await initializeTestEnvironment({projectId:`demo-study-metrics-${Date.now()}`,firestore:{host:'127.0.0.1',port:8080,rules:readFileSync('firestore.rules','utf8')}}); });
after(async () => { await env?.cleanup(); });
const dbFor = name => env.authenticatedContext(name).firestore();
const sample = { version:1,timeZone:'America/Chicago',weeklyGoal:18000 };
test('guest and another account cannot access private records or legacy data', async () => {
  const a=dbFor('owner'), b=dbFor('other'), guest=env.unauthenticatedContext().firestore();
  const path='studyMetricsV1/owner';
  await assertSucceeds(sdk.setDoc(sdk.doc(a,path),sample));
  for(const db of [guest,b]) {
    await assertFails(sdk.getDoc(sdk.doc(db,path)));
    await assertFails(sdk.setDoc(sdk.doc(db,path),sample));
    await assertFails(sdk.getDocs(sdk.collection(db,`${path}/days`)));
  }
  await assertFails(sdk.getDoc(sdk.doc(a,'users/owner')));
  await assertFails(sdk.deleteDoc(sdk.doc(a,path)));
});
test('owner profile create/update validate shape, immutable zone, and goal bounds', async () => {
  const db=dbFor('profile'), ref=sdk.doc(db,'studyMetricsV1/profile');
  await assertFails(sdk.setDoc(ref,{...sample,admin:true}));
  await assertSucceeds(sdk.setDoc(ref,sample));
  await assertFails(sdk.updateDoc(ref,{timeZone:'UTC'}));
  await assertFails(sdk.updateDoc(ref,{weeklyGoal:-1}));
  await assertFails(sdk.updateDoc(ref,{version:2}));
  await assertSucceeds(sdk.updateDoc(ref,{weeklyGoal:36000}));
});
test('real sync transactions count union once; retries and older updates write zero documents', async () => {
  const db=dbFor('merge'), store=cloudStore(sdk,db,'merge');
  await store.profile('UTC');
  const start=Date.UTC(2026,9,16,10), a={}, b={};
  addSpan(a,{kind:'study',start,end:start+30*60000},'UTC');
  addSpan(b,{kind:'study',start:start+15*60000,end:start+45*60000},'UTC');
  assert.equal(await store.sync(a),2);
  assert.equal(await store.sync(a),0);
  assert.equal(await store.sync(b),2);
  assert.equal(await store.sync(a),0);
  assert.equal((await store.days())[0].study,2700);
  const page=await store.hours(); assert.equal(counts(page.rows[0].coverage).study,2700);
  const base=await store.pendingBase(a); assert.equal(counts(Object.values(base)[0]).study,2700);
  assert.equal((await store.hours(page.cursor)).rows.length,0);
  assert.equal((await store.hoursSince('2026-10-16')).length,1);
  assert.equal((await store.hoursSince('2026-10-18')).length,0);
});
test('concurrent devices converge and promotion removes lower-priority seconds', async () => {
  const db=dbFor('concurrent'), store=cloudStore(sdk,db,'concurrent'); await store.profile('UTC');
  const start=Date.UTC(2026,9,16,11), pause={}, study={}, rest={};
  addSpan(pause,{kind:'pause',start,end:start+3600000},'UTC');
  addSpan(study,{kind:'study',start,end:start+1800000},'UTC');
  addSpan(rest,{kind:'break',start:start+1800000,end:start+2700000},'UTC');
  await store.sync(pause); await Promise.all([store.sync(study),store.sync(rest)]);
  assert.deepEqual((await store.days())[0],{day:'2026-10-16',study:1800,break:900,pause:900});
});
test('normal 50m work / 10m break hour uses 4 document writes, not periodic writes', async () => {
  const store=cloudStore(sdk,dbFor('usage'),'usage'); await store.profile('UTC');
  const start=Date.UTC(2026,9,16,12), q={};
  addSpan(q,{kind:'study',start,end:start+50*60000},'UTC'); const first=await store.sync(q);
  addSpan(q,{kind:'break',start:start+50*60000,end:start+60*60000},'UTC'); const second=await store.sync(q);
  assert.equal(first+second,4); assert.equal(await store.sync(q),0);
});
test('hour/day creates and updates reject malformed, oversized, and extra fields', async () => {
  const db=dbFor('validate'), start=Date.UTC(2026,9,16,10), day='2026-10-16';
  const ref=sdk.doc(db,`studyMetricsV1/validate/hours/${day}_${start}`);
  const valid={hourStart:start,day,coverage:EMPTY};
  await assertSucceeds(sdk.setDoc(ref,valid));
  for(const coverage of ['0','4'.repeat(3600),'0'.repeat(7200)]) await assertFails(sdk.updateDoc(ref,{coverage}));
  await assertFails(sdk.updateDoc(ref,{admin:true}));
  await assertFails(sdk.updateDoc(ref,{hourStart:start+3600000}));
  const daily=sdk.doc(db,`studyMetricsV1/validate/days/${day}`);
  await assertFails(sdk.setDoc(daily,{day,study:90001,break:0,pause:0}));
  await assertSucceeds(sdk.setDoc(daily,{day,study:90000,break:0,pause:0}));
  await assertFails(sdk.updateDoc(daily,{pause:-1}));
  await assertFails(sdk.updateDoc(daily,{study:'100'}));
});
