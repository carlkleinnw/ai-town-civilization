import { continuousTime } from '../../convex/civilization/clock';
import { Person, World } from '../../convex/civilization/model';
import { worldHour } from '../../convex/civilization/movement';

export type PresentationClock = {
  anchor: number;
  credited: number;
  seconds: number;
  serverNow: number;
  loop: number;
};
// At least ~360ms per edge; normal/slow always retain full walking.
export const continuousWalking = continuousTime;

export function presentationHour(
  w: World,
  clock: PresentationClock | undefined,
  received: number,
  now: number,
) {
  const base = worldHour(w) + (w.clock?.budget ?? 0);
  if (!w.running || !clock) return base;
  // Never credit a stalled/offline interval or predict past the scheduled boundary.
  const elapsed = clock.serverNow - clock.anchor + Math.max(0, now - received);
  const remaining = Math.max(0, Math.min(clock.seconds * 1000, elapsed) - clock.credited * 1000);
  return base + (remaining * w.speed * 24) / ((w.clock?.secondsPerDay ?? 120) * 1000);
}

export function motionPosition(p: Person, hour: number) {
  const m = p.motion;
  if (!m) return { x: p.x, y: p.y, fraction: 0 };
  const fraction = Math.max(0, Math.min(1, (hour - m.start) / (m.end - m.start)));
  return {
    x: m.fromX + (m.toX - m.fromX) * fraction,
    y: m.fromY + (m.toY - m.fromY) * fraction,
    fraction,
  };
}
