import { createWorld } from '../../convex/civilization/engine';
import { continuousWalking, motionPosition, presentationHour } from './motion';

test('walking uses absolute simulated time; never predicts beyond a reserved edge', () => {
  const w = createWorld({ name: 'display', seed: 'display' });
  const p = w.people[0];
  p.motion = { fromX: 2, fromY: 3, toX: 2, toY: 4, start: 10, end: 11 };
  expect(motionPosition(p, 10.25)).toEqual({ x: 2, y: 3.25, fraction: 0.25 });
  expect(motionPosition(p, 100)).toEqual({ x: 2, y: 4, fraction: 1 });
  w.clock!.hour = 10;
  w.running = true;
  const c = { anchor: 1000, credited: 0, seconds: 5, serverNow: 1000, loop: 0 };
  expect(presentationHour(w, c, 0, 2500)).toBe(10.5);
  expect(presentationHour(w, c, 0, 999999)).toBe(11);
  w.running = false;
  expect(presentationHour(w, c, 0, 999999)).toBe(10);
});
test('slow and normal modes retain walking while high speed can simplify', () => {
  const w = createWorld({ name: 'speeds', seed: 'speeds' });
  for (const speed of [0.25, 0.5, 1, 5, 7]) {
    w.speed = speed;
    expect(continuousWalking(w)).toBe(true);
  }
  w.speed = 120;
  expect(continuousWalking(w)).toBe(false);
});
