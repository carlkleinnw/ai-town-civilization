import { Person, World } from './model';

export const worldHour = (w: World) => w.day * 24 + (w.clock?.hour ?? 0);
// production settles the interval ending at this boundary.
export const actionHour = (w: World) => worldHour(w) + (w.clock ? 1 : 0);

export function passable(w: World, x: number, y: number) {
  return x >= 0 && x < 24 && y >= 0 && y < 16 && w.tiles[y * 24 + x]?.terrain !== 'water';
}

export function settleMovement(w: World, p: Person) {
  if (!p.motion || p.motion.end > actionHour(w) + 1e-9) return;
  const m = p.motion;
  if (passable(w, m.toX, m.toY)) {
    p.x = m.toX;
    p.y = m.toY;
  } else delete p.route;
  if (w.tiles[p.y * 24 + p.x]?.land)
    w.tiles[p.y * 24 + p.x].land!.traffic = Math.min(
      10000,
      w.tiles[p.y * 24 + p.x].land!.traffic + 1,
    );
  delete p.motion;
}

export function move(w: World, p: Person, x: number, y: number) {
  if (p.motion) return false;
  if (p.x === x && p.y === y) {
    delete p.route;
    return true;
  }
  if (p.task && p.task.phase !== 'hauling') p.task.phase = 'moving';
  const adjacent = (n: number) =>
    passable(w, n % 24, Math.floor(n / 24)) &&
    Math.abs((n % 24) - p.x) + Math.abs(Math.floor(n / 24) - p.y) === 1;
  if (p.route?.x !== x || p.route.y !== y || !p.route.steps.length || !adjacent(p.route.steps[0])) {
    const start = p.y * 24 + p.x,
      target = y * 24 + x,
      queue = [start];
    const previous = new Map<number, number>([[start, -1]]);
    for (let i = 0; i < queue.length && !previous.has(target); i++) {
      const n = queue[i];
      for (const next of [n - 24, n + 24, n % 24 > 0 ? n - 1 : -1, n % 24 < 23 ? n + 1 : -1]) {
        if (
          next < 0 ||
          next >= w.tiles.length ||
          previous.has(next) ||
          !passable(w, next % 24, Math.floor(next / 24))
        )
          continue;
        previous.set(next, n);
        queue.push(next);
      }
    }
    if (!previous.has(target)) {
      delete p.route;
      if (p.task) p.task.phase = 'waiting';
      return false;
    }
    const steps: number[] = [];
    for (let n = target; n !== start; n = previous.get(n)!) steps.push(n);
    p.route = { x, y, steps: steps.reverse() };
  }
  const next = p.route.steps.shift()!,
    toX = next % 24,
    toY = Math.floor(next / 24);
  if (!w.clock) {
    p.x = toX;
    p.y = toY;
    return false;
  } // historical daily executor
  const destination = w.tiles[next];
  const duration =
    destination.land?.use === 'road'
      ? 1
      : destination.terrain === 'hill' || (destination.land?.vegetation ?? 0) > 0.55
        ? 2
        : 1;
  p.motion = {
    fromX: p.x,
    fromY: p.y,
    toX,
    toY,
    start: actionHour(w),
    end: actionHour(w) + duration,
  };
  return false;
}
