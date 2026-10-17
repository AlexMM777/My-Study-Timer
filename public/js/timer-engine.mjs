// Pure clock/state machine. Browser callbacks only wake the clock; they do not count time.
export const SUSPEND_GAP = 120_000;
export const PAUSE_CAP = 30 * 60_000;
export function duration(value, fallback) {
  return Number.isInteger(value) && value >= 1 && value <= 1440 ? value : fallback;
}
export class TimerEngine {
  constructor({ now = Date.now, emit = () => {}, work = 50, short = 10, long = 20, cycles = 4 } = {}) {
    this.now = now; this.emit = emit;
    this.durations = { work: duration(work, 50), short: duration(short, 10), long: duration(long, 20) };
    this.cycles = duration(cycles, 4);
    this.phase = 'work'; this.remaining = this.durations.work * 60_000;
    this.paused = true; this.started = false; this.completed = 0; this.pauseAt = null;
    this.last = now(); this.revision = 0;
  }
  snapshot() {
    return { phase: this.phase, remaining: this.remaining, paused: this.paused,
      started: this.started, completed: this.completed, at: this.last, revision: this.revision };
  }
  event(kind, at, extra = {}) { this.emit({ kind, at, state: this.snapshot(), ...extra }); }
  span(kind, start, end) { if (end > start) this.event('span', end, { span: { kind, start, end } }); }
  tick(at = this.now()) {
    const gap = at - this.last;
    if (gap < 0 || gap > SUSPEND_GAP) {
      this.paused = true; this.pauseAt = null; this.last = at;
      this.event('suspend', at); return;
    }
    if (this.paused) {
      if (this.pauseAt !== null) this.span('pause', this.last, Math.min(at, this.pauseAt + PAUSE_CAP));
      this.last = at; return;
    }
    let cursor = this.last;
    while (cursor < at) {
      const end = Math.min(at, cursor + this.remaining);
      this.span(this.phase === 'work' ? 'study' : 'break', cursor, end);
      this.remaining -= end - cursor; cursor = end;
      if (this.remaining === 0) {
        if (this.phase === 'work') {
          this.completed++;
          this.phase = this.completed % this.cycles === 0 ? 'long' : 'short';
        } else this.phase = 'work';
        this.remaining = this.durations[this.phase] * 60_000;
        this.event('phase', cursor);
      }
    }
    this.last = at;
  }
  toggle() {
    const at = this.now(); this.tick(at); this.revision++;
    this.paused = !this.paused;
    this.pauseAt = this.paused ? at : null;
    this.started = true; this.event(this.paused ? 'pause' : 'resume', at);
  }
  reset() {
    const at = this.now(); this.tick(at); this.revision++;
    this.phase = 'work'; this.remaining = this.durations.work * 60_000;
    this.paused = true; this.started = false; this.pauseAt = null; this.completed = 0;
    this.event('reset', at);
  }
  jump(phase) {
    if (!Object.hasOwn(this.durations, phase)) return;
    const at = this.now(); this.tick(at); this.revision++;
    this.phase = phase; this.remaining = this.durations[phase] * 60_000;
    // Switching a paused phase does not restart its 30-minute allowance.
    this.event('jump', at);
  }
  restore(saved) {
    if (this.revision || !saved || !Object.hasOwn(this.durations, saved.phase) ||
      !Number.isFinite(saved.remaining) || saved.remaining <= 0 || saved.remaining > 86_400_000) return false;
    this.phase = saved.phase; this.remaining = saved.remaining;
    this.completed = Number.isInteger(saved.completed) ? Math.max(0, saved.completed) : 0;
    this.paused = true; this.pauseAt = null; this.started = !!saved.started; this.last = this.now();
    this.event('restore', this.last); return true;
  }
}
