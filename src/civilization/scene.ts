import * as PIXI from 'pixi.js';
import { Action, Building, Person, Plan, Tile, World } from '../../convex/civilization/model';
import { hashSeed } from '../../convex/civilization/random';

// Civilization-specific pixel geometry. Coordinates remain the saved 24 × 16 grid.
export const TILE = 64;
export const MAP_WIDTH = 24 * TILE;
export const MAP_HEIGHT = 16 * TILE;
export function rect(g: PIXI.Graphics, color: number, x: number, y: number, w: number, h: number) {
  return g.beginFill(color).drawRect(x, y, w, h).endFill();
}
function polygon(g: PIXI.Graphics, color: number, points: number[]) {
  g.beginFill(color).drawPolygon(points).endFill();
}

export function terrainArt(w: World, t: Tile) {
  const g = new PIXI.Graphics();
  const n = hashSeed(`${w.seed}:${t.x},${t.y}`);
  const season = Math.floor(w.day / 90) % 4;
  const winter = season === 3;
  const dry = t.fertility < 0.45;
  const ground = winter ? 0xa7b8a1 : dry ? 0xa49a68 : season === 2 ? 0x7f8c4c : 0x668650;
  rect(g, t.terrain === 'water' ? 0x416d7c : ground, 0, 0, TILE, TILE);
  if (t.terrain === 'water') {
    for (let i = 0; i < 7; i++) {
      const x = (n * (i + 3)) % 51,
        y = (n + i * 19) % 59;
      rect(g, i % 2 ? 0x527f8a : 0x385e70, x, y, 8 + (i % 4), 2);
    }
    return g;
  }
  // Sparse pixel grass varies within each saved tile; no invented roads or structures.
  for (let i = 0; i < 25; i++) {
    const x = (n + i * 23) % 61,
      y = (n * 3 + i * 37) % 61;
    rect(
      g,
      i % 3 ? (winter ? 0xbdc7b0 : dry ? 0xb3a676 : 0x78945a) : winter ? 0x909f8e : 0x587548,
      x,
      y,
      2 + (i % 3),
      2,
    );
  }
  const waterAt = (x: number, y: number) => w.tiles[y * 24 + x]?.terrain === 'water';
  const shore = winter ? 0xc1c0a0 : 0xb1a77c;
  if (t.x > 0 && waterAt(t.x - 1, t.y)) {
    rect(g, shore, 0, 0, 5, 64);
    rect(g, 0x7f9472, 5, 0, 3, 64);
  }
  if (t.x < 23 && waterAt(t.x + 1, t.y)) {
    rect(g, shore, 59, 0, 5, 64);
    rect(g, 0x7f9472, 56, 0, 3, 64);
  }
  if (t.y > 0 && waterAt(t.x, t.y - 1)) rect(g, shore, 0, 0, 64, 5);
  if (t.y < 15 && waterAt(t.x, t.y + 1)) rect(g, shore, 0, 59, 64, 5);
  if (t.land?.use === 'road') {
    rect(g, 0xab9971, 0, 25, 64, 13);
    rect(g, 0xc9b58a, 0, 28, 64, 3);
  }
  if (t.land?.use === 'field') for (let y = 15; y < 57; y += 9) rect(g, 0x796343, 7, y, 50, 3);
  if (t.land?.terraces)
    for (let y = 18; y < 60; y += 11) rect(g, 0xb1a47d, 4, y, 56 * t.land.terraces, 3);
  const project = w.landProjects?.find(
    (p) => p.tile === t.y * 24 + t.x && !['completed', 'cancelled'].includes(p.status),
  );
  if (project) {
    rect(g, 0x3d4037, 4, 58, 56, 4);
    rect(g, 0xe0bf76, 4, 58, (56 * project.progress) / project.labor, 4);
    g.lineStyle(1, 0xe0bf76, 0.7).drawRect(2, 2, 60, 60).lineStyle(0);
  }
  return g;
}

let forestTexture: PIXI.Texture | undefined;
export function resourceArt(w: World, t: Tile, occupied: boolean) {
  const g = new PIXI.Graphics();
  if (!t.explored || t.terrain === 'water') return g;
  if (occupied) {
    // Preserve visibility of the old save's natural reservoirs; no invented clearing.
    rect(g, 0x354a36, 0, 0, 24, 9);
    if (t.wood > 0.1) {
      rect(g, 0x82603c, 3, 3, 2, 5);
      rect(g, 0x90b16c, 1, 1, 6, 4);
    }
    if (t.stone > 0.1) rect(g, 0xc2bfa5, 10, 3, 5, 4);
    if (t.food > 0.1) {
      rect(g, 0xa3ad69, 18, 3, 4, 4);
      rect(g, 0xe1c57c, 19, 1, 2, 3);
    }
    return g;
  }
  const season = Math.floor(w.day / 90) % 4;
  const n = hashSeed(`${w.seed}:${t.x}:${t.y}`);
  const group = new PIXI.Container();
  group.addChild(g);
  const clusters = Math.min(3, Math.ceil(t.wood / 35));
  if (t.wood > 15) {
    // Reuse the botanical sprite, never the original town's fixed map or entities.
    forestTexture ??= new PIXI.Texture(
      PIXI.BaseTexture.from('/ai-town/assets/rpg-tileset.png', {
        scaleMode: PIXI.SCALE_MODES.NEAREST,
      }),
      new PIXI.Rectangle(32, 768, 96, 128),
    );
    for (let i = 0; i < clusters; i++) {
      const tree = new PIXI.Sprite(forestTexture);
      const growth = Math.min(1, t.wood / 65);
      tree.width = 30 + growth * 12;
      tree.height = 40 + growth * 16;
      tree.position.set([0, 25, 13][i], [1, 8, -9][i] + (56 - tree.height));
      tree.tint = season === 2 ? 0xd0b87e : season === 3 ? 0xc7d3c5 : 0xc2d4ac;
      group.addChild(tree);
    }
  } else if (t.wood > 0.1) {
    rect(g, 0x755c3d, 29, 30, 4, 14);
    rect(g, 0x6c8e4f, 22, 27, 17, 9);
    rect(g, 0xa3b36b, 27, 23, 10, 7);
  } else if (t.terrain === 'forest') {
    rect(g, 0x705b3e, 25, 36, 12, 7);
    rect(g, 0xbc9d65, 27, 35, 9, 3);
  }
  if (t.stone > 0.1) {
    const count = Math.min(4, Math.ceil(t.stone / 55));
    for (let i = 0; i < count; i++) {
      const x = 6 + i * 11,
        y = 42 - (i % 2) * 7;
      polygon(g, 0x5e645a, [
        x,
        y + 12,
        x - 2,
        y + 4,
        x + 3,
        y - 3,
        x + 12,
        y - 3,
        x + 17,
        y + 6,
        x + 14,
        y + 12,
      ]);
      polygon(g, 0xa3a48a, [x, y + 3, x + 4, y - 3, x + 11, y - 3, x + 13, y + 3, x + 5, y + 7]);
      rect(g, 0xc4bfa1, x + 4, y - 1, 5, 2);
    }
  } else if (t.terrain === 'hill') {
    rect(g, 0x867e61, 11, 43, 41, 7);
    rect(g, 0xa19876, 17, 40, 26, 3);
  }
  for (let i = 0; i < Math.min(5, Math.ceil(t.food / 8)); i++) {
    const x = 5 + ((n + i * 17) % 51),
      y = 44 + (i % 3) * 6;
    rect(g, season === 3 ? 0x82946d : 0x435f39, x, y, 8, 5);
    rect(g, season === 2 ? 0xba9a56 : 0x849958, x + 1, y - 2, 6, 4);
    rect(g, season === 3 ? 0xb9c6a7 : 0xd1ad67, x + 3, y - 2, 2, 2);
  }
  return group;
}

function roof(g: PIXI.Graphics, color: number, y = 5) {
  polygon(g, 0x4d4435, [2, y + 18, 31, y - 3, 61, y + 18, 57, y + 23, 6, y + 23]);
  polygon(g, color, [3, y + 17, 31, y, 60, y + 17, 55, y + 20, 7, y + 20]);
  for (let row = 0; row < 4; row++)
    rect(g, 0xaa8a53, 10 + row * 4, y + 16 - row * 4, 42 - row * 8, 2);
  rect(g, 0xdbc089, 28, y + 1, 7, 3);
}

export function buildingArt(
  w: World,
  b: Pick<Building, 'kind' | 'condition' | 'cropDay' | 'cropLabor'>,
  stage = 1,
) {
  const g = new PIXI.Graphics();
  rect(g, 0x4d5940, 3, 55, 58, 6);
  if (b.kind === 'farm') {
    if (stage < 0.15) {
      rect(g, 0xb49b6c, 5, 6, 4, 48);
      rect(g, 0xb49b6c, 55, 6, 4, 48);
      return g;
    }
    rect(g, 0x76593c, 2, 4, 60, 56);
    for (let row = 0; row < (stage < 0.5 ? 1 : stage < 0.8 ? 3 : 5); row++) {
      rect(g, 0x4b4030, 5, 10 + row * 10, 54, 3);
      if (b.cropDay !== undefined)
        for (let col = 0; col < 6; col++) {
          const height = Math.min(9, 2 + Math.floor((w.day - b.cropDay) / 12));
          rect(
            g,
            w.day - b.cropDay >= 90 ? 0xd6b86b : 0x8fa755,
            8 + col * 8,
            11 + row * 10 - height,
            3,
            height,
          );
          rect(g, 0xb5bc6d, 7 + col * 8, 12 + row * 10 - height, 5, 2);
        }
    }
    return g;
  }
  rect(g, 0x9d9172, 7, 49, 50, 7);
  if (stage < 0.15) {
    rect(g, 0xc2af86, 9, 47, 46, 3);
    return g;
  }
  for (const x of [9, 51]) {
    rect(g, 0x684d36, x, 19, 4, 33);
    rect(g, 0xc1a06a, x, 19, 2, 31);
  }
  rect(g, 0x95774b, 9, 20, 46, 4);
  if (stage < 0.5) return g;
  if (b.kind === 'hut') {
    rect(g, 0xb19562, 11, 26, 42, 25);
    for (let y = 30; y < 50; y += 5) rect(g, 0x95794d, 12, y, 40, 1);
    rect(g, 0x483e30, 27, 33, 12, 20);
    rect(g, 0xd1b781, 28, 33, 2, 19);
    rect(g, 0x5c6a59, 15, 31, 8, 7);
    rect(g, 0x3a463b, 16, 32, 6, 5);
    if (stage >= 0.8) roof(g, 0xc1a06a, 5);
  } else if (b.kind === 'granary') {
    for (const x of [13, 45]) rect(g, 0x544b37, x, 42, 5, 14);
    rect(g, 0xb7a078, 9, 24, 46, 22);
    for (let x = 12; x < 54; x += 7) rect(g, 0x8b754e, x, 26, 2, 18);
    rect(g, 0x594b34, 27, 28, 12, 13);
    rect(g, 0xd7c089, 28, 29, 10, 10);
    rect(g, 0xc4ae79, 9, 44, 46, 3);
    if (stage >= 0.8) roof(g, 0xbda56a, 1);
    for (let x = 5; x < 58; x += 43) {
      rect(g, 0x9c7846, x, 47, 10, 9);
      rect(g, 0xd0b071, x + 1, 46, 8, 3);
    }
  } else if (b.kind === 'workshop') {
    rect(g, 0x5b4e39, 11, 28, 42, 21);
    rect(g, 0x2d3b36, 14, 29, 36, 16);
    rect(g, 0xb69b6a, 11, 42, 43, 4);
    rect(g, 0x806749, 14, 46, 3, 9);
    rect(g, 0x806749, 48, 46, 3, 9);
    rect(g, 0x9a9c89, 27, 37, 14, 4);
    rect(g, 0x757e73, 30, 33, 8, 5);
    rect(g, 0x686c60, 47, 7, 9, 28);
    rect(g, 0xa3a18b, 47, 7, 3, 24);
    if (stage >= 0.8) roof(g, 0x92745b, 0);
  } else if (b.kind === 'school') {
    rect(g, 0xb4ad86, 11, 25, 42, 26);
    rect(g, 0x4f6051, 23, 28, 20, 12);
    rect(g, 0xaeb793, 26, 31, 11, 1);
    rect(g, 0xaeb793, 26, 35, 8, 1);
    for (const y of [43, 50]) {
      rect(g, 0xc5ad79, 15, y, 34, 3);
      rect(g, 0x76613f, 19, y + 3, 2, 3);
      rect(g, 0x76613f, 43, y + 3, 2, 3);
    }
    if (stage >= 0.8) roof(g, 0x8c9e7c, 0);
  }
  if (b.condition < 0.3) {
    g.lineStyle(2, 0x423d32)
      .moveTo(17, 25)
      .lineTo(22, 33)
      .lineTo(18, 40)
      .lineTo(24, 49)
      .lineStyle(0);
    rect(g, 0x574d39, 39, 15, 8, 5);
  }
  return g;
}

export function constructionStage(p: Plan) {
  if (p.status === 'completed') return { zh: '建成', en: 'Complete' };
  if (p.status === 'failed') return { zh: '失败', en: 'Failed' };
  if (!p.paid) return { zh: '备料', en: 'Materials' };
  const r = p.progress / p.labor;
  return r < 0.15
    ? { zh: '地基', en: 'Foundation' }
    : r < 0.5
      ? { zh: '框架', en: 'Frame' }
      : r < 0.8
        ? { zh: '主体', en: 'Walls' }
        : { zh: '封顶', en: 'Roof' };
}

export function activityArt(p: Person) {
  const g = new PIXI.Graphics();
  if (p.carrying) {
    const color =
      p.carrying.resource === 'food'
        ? 0xd3b46b
        : p.carrying.resource === 'wood'
          ? 0xa58251
          : 0xb0b3a0;
    rect(g, 0x473e31, 10, -9, 10, 12);
    rect(g, color, 11, -8, 8, 9);
    rect(g, 0xd1bb8d, 10, -5, 10, 1);
  }
  if (p.task?.phase !== 'working' && p.task?.phase !== 'resting' && p.task?.phase !== 'family')
    return g;
  const action: Action | 'rest' | 'child' = p.job;
  if (p.task?.phase === 'resting') {
    g.lineStyle(2, 0xd3d6b7).moveTo(-12, -18).lineTo(-6, -18).lineTo(-12, -12).lineTo(-6, -12);
  } else if (action === 'teach' || action === 'child' || action === 'research') {
    polygon(g, 0x504b36, [-16, -11, -8, -13, 0, -11, 0, -1, -8, -3, -16, -1]);
    rect(g, 0xe1d5ac, -15, -11, 6, 8);
    rect(g, 0xc6ba91, -7, -11, 6, 8);
  } else if (action === 'gather') {
    rect(g, 0xb7975b, -17, -3, 13, 8);
    rect(g, 0x4d6a40, -15, -6, 9, 4);
    rect(g, 0xd3b365, -13, -7, 3, 3);
  } else {
    g.lineStyle(2, 0xccb483).moveTo(-10, 1).lineTo(-5, -13).lineStyle(0);
    if (action === 'logging') polygon(g, 0xbfc3ae, [-8, -14, -2, -13, 2, -7, -7, -9]);
    else if (action === 'quarry')
      polygon(g, 0xaeb5a5, [-14, -12, -7, -16, 1, -12, -1, -10, -7, -13, -13, -10]);
    else if (action === 'farm' || action === 'restore') rect(g, 0xa5b09b, -12, -16, 10, 3);
    else {
      rect(g, 0xabb0a2, -11, -15, 11, 5);
      rect(g, 0xcbd0bb, -11, -15, 3, 4);
    }
  }
  return g;
}

export function visualIdentity(id: string) {
  return hashSeed(id);
}
