import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { TimerEngine } from '../public/js/timer-engine.mjs';
import * as core from '../public/js/metrics-core.mjs';

async function harness(disk = new Map()) {
  let now = Date.UTC(2026,9,17,12), nextId = 0, authChange, subscriber;
  const jobs = new Map(), nodes = new Map(), calls = { profile:0, sync:[], reads:0 }, auth = {currentUser:null};
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent:'', value:'', hidden:false, open:false, dataset:{},
      close(){this.open=false;}, showModal(){this.open=true;}, replaceChildren(){this.textContent='';},
      querySelectorAll(){return[];}, checkValidity(){return true;} });
    return nodes.get(id);
  };
  const engine = new TimerEngine({now:()=>now,work:1440,emit:event=>subscriber?.(event)});
  const timer = { getState:()=>engine.snapshot(), checkpoint:()=>{engine.tick();return engine.snapshot();}, restore:s=>engine.restore(s), subscribe:fn=>{subscriber=fn;} };
  const events = {}, navigator = {onLine:true,locks:{request:async(_name,_opts,fn)=>fn({})}};
  const sdk = { getAuth:()=>auth,onAuthStateChanged:(_auth,fn)=>{authChange=fn;fn(null);},
    signOut:async()=>{auth.currentUser=null;authChange(null);}, GoogleAuthProvider:class {},
    initializeFirestore:()=>({}),memoryLocalCache:()=>({}),initializeApp:()=>({}) };
  const cloud = { profile:async()=>{calls.profile++;return {version:1,timeZone:'UTC',weeklyGoal:18000};},
    sync:async queue=>{calls.sync.push(structuredClone(queue));return 2;},
    days:async()=>{calls.reads++;return[];},hours:async()=>({rows:[],more:false}),pendingBase:async()=>({}),settings:async()=>null,goal:async()=>{} };
  const local = {openLocal:async()=>disk,readLocal:async(_db,uid)=>structuredClone(disk.get(uid)||{queue:{}}),
    writeLocal:async(_db,uid,value)=>{disk.set(uid,structuredClone(value));}};
  const schedule = (fn,delay,repeat=false) => {const id=++nextId;jobs.set(id,{fn,at:now+delay,delay,repeat});return id;};
  const context = vm.createContext({console,Intl,URLSearchParams,structuredClone,
    Date:class extends Date {static now(){return now;}}, navigator,
    location:{hostname:'test.invalid',search:''}, document:{getElementById:node,querySelectorAll:()=>[],addEventListener:(name,fn)=>{events[name]=fn;}},
    window:{addEventListener:(name,fn)=>{events[name]=fn;}},
    setTimeout:(fn,delay)=>schedule(fn,delay),setInterval:(fn,delay)=>schedule(fn,delay,true),
    clearTimeout:id=>jobs.delete(id) });
  function moduleFor(value) {
    return new vm.SyntheticModule(Object.keys(value),function(){for(const [key,item] of Object.entries(value))this.setExport(key,item);},{context});
  }
  const module = new vm.SourceTextModule(readFileSync('public/js/metrics.js','utf8'),{context,
    importModuleDynamically:async()=>{const m=moduleFor(sdk);await m.link(()=>{});await m.evaluate();return m;}});
  await module.link(name=>moduleFor(name.includes('firebase-config')?{firebaseConfig:{}}:name.includes('metrics-core')?core:
    name.includes('metrics-local')?local:name.includes('metrics-cloud')?{cloudStore:()=>cloud}:{renderStats:()=>{}}));
  await module.evaluate(); await module.namespace.initMetrics(timer);
  const settle = async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
  async function advance(ms) {
    while(ms>0){const part=Math.min(1000,ms);now+=part;engine.tick();ms-=part;
      for(const [id,job] of [...jobs])if(job.at<=now){if(job.repeat)job.at+=job.delay;else jobs.delete(id);job.fn();}
      await settle();
    }
  }
  return {engine,calls,disk,node,navigator,events,advance,settle, async login(uid){auth.currentUser={uid,email:`${uid}@example.test`,providerData:[{providerId:'password'}]};authChange(auth.currentUser);await settle();}, async logout(){await node('signOutAccount').onclick();await settle();}};
}
test('guest activity has zero database IO; signed-in uninterrupted work stays local', async()=>{
  const h=await harness();h.engine.toggle();await h.advance(60000);
  assert.equal(h.calls.profile,0);assert.equal(h.calls.sync.length,0);assert.equal(h.disk.size,0);
  await h.login('alice');await h.advance(10*60000);
  assert.equal(h.calls.sync.length,0);
  const seconds=Object.values(h.disk.get('alice').queue).reduce((n,x)=>n+core.counts(x.coverage).study,0);
  assert.equal(seconds,600); // The minute before sign-in is never backfilled.
  h.engine.jump('short');await h.advance(2000);assert.equal(h.calls.sync.length,1);
});
test('brief pauses do not sync; sustained pause saves once and opening stats writes nothing',async()=>{
  const h=await harness();await h.login('alice');h.engine.toggle();await h.advance(10000);h.engine.toggle();
  await h.advance(30000);h.engine.toggle();await h.advance(40000);assert.equal(h.calls.sync.length,0);
  h.engine.toggle();await h.advance(62000);assert.equal(h.calls.sync.length,1);
  h.node('openStats').onclick();await h.settle();assert.equal(h.calls.sync.length,1);
  await h.advance(2*60000);assert.equal(h.calls.sync.length,1);
});
test('offline queue survives reopening; next account never receives it; sign-out stops recording',async()=>{
  const h=await harness();await h.login('alice');h.engine.toggle();await h.advance(10000);
  h.navigator.onLine=false;h.engine.reset();await h.advance(3000);assert.equal(h.calls.sync.length,0);
  await h.logout();await h.login('bob');await h.advance(5000);assert.equal(h.calls.sync.length,0);
  assert.equal(h.disk.has('bob'),false);assert.ok(Object.keys(h.disk.get('alice').queue).length);
  const reopened=await harness(h.disk);await reopened.login('alice');await reopened.settle();
  assert.equal(reopened.calls.sync.length,1);assert.equal(reopened.engine.paused,true);
  reopened.engine.toggle();await reopened.advance(5000);await reopened.logout();
  const count=reopened.calls.sync.length;await reopened.advance(10000);assert.equal(reopened.calls.sync.length,count);
  assert.equal(reopened.node('metricsStatus').textContent,'Metrics off · Sign in to save your study time');
});
