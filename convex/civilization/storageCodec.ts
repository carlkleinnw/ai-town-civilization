import { World, alive } from './model';

export type WorldPart = { key: string; data: unknown[] };
export type WorldCore = Record<string, unknown> & {
  _parts: Record<string, number>;
};

/** Lossless chunks: the engine still sees the exact same World, with no quantization. */
export function splitWorld(world: World) {
  const core: Record<string, unknown> = {};
  const manifest: Record<string, number> = {};
  const parts: WorldPart[] = [];
  for (const [field, value] of Object.entries(world)) {
    if (!Array.isArray(value)) {
      core[field] = value;
      continue;
    }
    const size = field === 'people' ? 1 : 24;
    manifest[field] = Math.ceil(value.length / size);
    for (let i = 0; i < value.length; i += size)
      parts.push({ key: `${field}:${i / size}`, data: value.slice(i, i + size) });
  }
  parts.push({ key: '_summary', data: [summarizeWorld(world)] });
  // Snapshot scalar objects too: callers may subsequently advance the mutable engine.
  return {
    core: JSON.parse(JSON.stringify({ ...core, _parts: manifest })) as WorldCore,
    parts: JSON.parse(JSON.stringify(parts)) as WorldPart[],
  };
}

export function joinWorld(core: WorldCore, parts: WorldPart[]): World {
  const { _parts: manifest, ...scalars } = core;
  const data = new Map(parts.map((p) => [p.key, p.data]));
  const world: Record<string, unknown> = { ...scalars };
  for (const [field, count] of Object.entries(manifest)) {
    const values: unknown[] = [];
    for (let i = 0; i < count; i++) {
      const chunk = data.get(`${field}:${i}`);
      if (!chunk) throw new Error(`Missing civilization state chunk: ${field}:${i}`);
      values.push(...chunk);
    }
    world[field] = values;
  }
  return world as World;
}

export function changedParts(before: WorldPart[], after: WorldPart[]) {
  const previous = new Map(before.map((p) => [p.key, JSON.stringify(p.data)]));
  return after.filter((p) => previous.get(p.key) !== JSON.stringify(p.data));
}

export function summarizeWorld(w: World) {
  return {
    name: w.name,
    day: w.day,
    population: alive(w).length,
    births: w.births,
    deaths: w.deaths,
    food: w.stock.food,
    health: w.samples[w.samples.length - 1]?.health ?? 1,
    buildings: w.buildings.length,
    knowledge: w.technologies.filter((t) => t.discovered !== undefined && t.lost === undefined)
      .length,
    strategy: w.strategy.name,
    seed: w.seed,
    running: w.running,
    branch: w.branch ?? null,
    samples: w.samples,
  };
}
