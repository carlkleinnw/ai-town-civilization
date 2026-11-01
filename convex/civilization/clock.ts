import { World } from './model';
import { advanceHours } from './engine';

export const SPEEDS = [0.25, 0.5, 1, 5, 7, 30, 60, 120, 600, 3600];
export const DEFAULT_SECONDS_PER_DAY = 120;
export const MAX_HOURS_PER_TICK = 72;

/** Optional fields allow old saves to be opened without rewriting identities or history. */
export function ensureClock(w: World) {
  w.clock ??= {
    version: 2,
    hour: 0,
    budget: 0,
    secondsPerDay: DEFAULT_SECONDS_PER_DAY,
    limited: false,
  };
  return w.clock;
}

/** Only a bounded online heartbeat is credited; wall time and offline gaps are never inputs. */
export function heartbeat(w: World, seconds = 1) {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 1)
    throw Error('Invalid live time interval');
  const clock = ensureClock(w);
  clock.budget += (w.speed * 24 * seconds) / clock.secondsPerDay;
  const requested = Math.floor(clock.budget + 1e-9);
  const hours = Math.min(requested, MAX_HOURS_PER_TICK);
  clock.limited = requested > MAX_HOURS_PER_TICK;
  // Excess time is slowed, not silently settled without executing the hourly rules.
  clock.budget -= requested;
  advanceHours(w, hours, false);
}

export const continuousTime = (w: World) =>
  (w.clock?.secondsPerDay ?? DEFAULT_SECONDS_PER_DAY) / (24 * w.speed) >= 0.36;
