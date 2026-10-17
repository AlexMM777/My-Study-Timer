import { EMPTY, counts, mergeCoverage } from './metrics-core.mjs';

// SDK injection lets the exact browser transaction code run against the local emulator.
export function cloudStore(sdk, db, uid) {
  const root = `studyMetricsV1/${uid}`;
  const profileRef = sdk.doc(db, root);
  return {
    async profile(zone) {
      return sdk.runTransaction(db, async tx => {
        const snapshot = await tx.get(profileRef);
        if (snapshot.exists()) return snapshot.data();
        const value = { version: 1, timeZone: zone, weeklyGoal: 18000 };
        tx.set(profileRef, value); return value;
      });
    },
    goal: seconds => sdk.updateDoc(profileRef, { weeklyGoal: seconds }),
    async settings() { const snapshot = await sdk.getDoc(profileRef); return snapshot.exists() ? snapshot.data() : null; },
    async sync(pending) {
      const entries = Object.entries(pending);
      let writes = 0;
      // Each transaction is small, idempotent, and reads every document before any write.
      for (let offset = 0; offset < entries.length; offset += 8) {
        const batch = entries.slice(offset, offset + 8);
        const count = await sdk.runTransaction(db, async tx => {
          const hours = await Promise.all(batch.map(([id]) => tx.get(sdk.doc(db, `${root}/hours/${id}`))));
          const dates = [...new Set(batch.map(([, value]) => value.day))];
          const daily = await Promise.all(dates.map(day => tx.get(sdk.doc(db, `${root}/days/${day}`))));
          const totals = Object.fromEntries(dates.map((day, i) => [day,
            daily[i].exists() ? { ...daily[i].data() } : { day, study: 0, break: 0, pause: 0 }]));
          const changedDays = new Set(); let actual = 0;
          batch.forEach(([id, incoming], i) => {
            const previous = hours[i].exists() ? hours[i].data().coverage : EMPTY;
            const coverage = mergeCoverage(previous, incoming.coverage);
            if (coverage === previous) return;
            const before = counts(previous), after = counts(coverage);
            for (const kind of ['study', 'break', 'pause']) totals[incoming.day][kind] += after[kind] - before[kind];
            tx.set(sdk.doc(db, `${root}/hours/${id}`), { hourStart: incoming.hourStart, day: incoming.day, coverage });
            changedDays.add(incoming.day); actual++;
          });
          for (const day of changedDays) { tx.set(sdk.doc(db, `${root}/days/${day}`), totals[day]); actual++; }
          return actual;
        });
        writes += count;
      }
      return writes;
    },
    async days() {
      const result = await sdk.getDocs(sdk.query(sdk.collection(db, `${root}/days`), sdk.orderBy('day')));
      return result.docs.map(doc => doc.data());
    },
    async hours(cursor) {
      const clauses = [sdk.orderBy('hourStart', 'desc'), sdk.limit(48)];
      if (cursor) clauses.push(sdk.startAfter(cursor));
      const result = await sdk.getDocs(sdk.query(sdk.collection(db, `${root}/hours`), ...clauses));
      return { rows: result.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        cursor: result.docs.at(-1), more: result.size === 48 };
    },
    async pendingBase(queue) {
      return Object.fromEntries(await Promise.all(Object.keys(queue).map(async id => {
        const doc = await sdk.getDoc(sdk.doc(db, `${root}/hours/${id}`));
        return [id, doc.exists() ? doc.data().coverage : EMPTY];
      })));
    }
  };
}
