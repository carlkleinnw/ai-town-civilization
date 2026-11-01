import * as PIXI from 'pixi.js';
import { World, Person, alive, age } from '../../convex/civilization/model';
import { RECIPES } from '../../convex/civilization/catalog';
import { Selection } from './WorldMap';
import {
  TILE,
  terrainArt,
  resourceArt,
  buildingArt,
  constructionStage,
  activityArt,
  rect,
  visualIdentity,
} from './scene';

export function personPosition(p: Person) {
  const h = visualIdentity(p.id);
  return {
    x: (p.x + 0.5) * TILE + ((h % 5) - 2) * 9,
    y: (p.y + 0.64) * TILE + (((h >>> 4) % 3) - 1) * 10,
  };
}
export function renderScene({
  w,
  selected,
  locale,
  terrain,
  objects,
  agents,
  overlay,
  sprites,
  indicators,
  humanTextures,
  select,
}: {
  w: World;
  selected: Selection;
  locale: 'zh' | 'en';
  terrain: PIXI.Container;
  objects: PIXI.Container;
  agents: PIXI.Container;
  overlay: PIXI.Graphics;
  sprites: Map<string, PIXI.Sprite>;
  indicators: Map<string, PIXI.Container>;
  humanTextures: PIXI.Texture[][];
  select: (s: Selection, e?: PIXI.FederatedPointerEvent) => void;
}) {
  terrain.removeChildren().forEach((c) => c.destroy({ children: true }));
  objects.removeChildren().forEach((c) => c.destroy({ children: true }));
  overlay.clear();
  objects.sortableChildren = true;
  const click = (o: PIXI.Container, s: Selection) => {
    o.eventMode = 'static';
    o.cursor = 'pointer';
    o.on('pointertap', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation();
      select(s, e);
    });
  };
  const label = (text: string, x: number, y: number, color = 0xefe0b8) => {
    const l = new PIXI.Text(text, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: 10,
      fill: color,
      stroke: 0x283b30,
      strokeThickness: 3,
    });
    l.anchor.set(0.5, 0);
    l.position.set(x, y);
    l.eventMode = 'none';
    return l;
  };
  const occupied = new Set(
    [
      ...w.buildings.filter((b) => b.condition > 0),
      ...w.plans.filter((p) => p.paid && p.status === 'executing' && RECIPES[p.action].building),
    ].map((e) => `${e.x},${e.y}`),
  );
  for (const t of w.tiles) {
    const g = terrainArt(w, t);
    if (t.control)
      g.lineStyle(1, t.control.groupId === 'group0' ? 0xe5c77e : 0x82b3c2, 0.75)
        .drawRect(1, 1, 62, 62)
        .lineStyle(0);
    g.position.set(t.x * TILE, t.y * TILE);
    click(g, { type: 'tile', id: String(t.y * 24 + t.x) });
    terrain.addChild(g);
    const r = resourceArt(w, t, occupied.has(`${t.x},${t.y}`));
    r.position.copyFrom(g.position);
    r.zIndex = t.y * TILE + (occupied.has(`${t.x},${t.y}`) ? 72 : 45);
    if (occupied.has(`${t.x},${t.y}`)) {
      r.hitArea = new PIXI.Rectangle(0, 0, 24, 10);
      click(r, { type: 'tile', id: String(t.y * 24 + t.x) });
    } else r.eventMode = 'none';
    objects.addChild(r);
    if (!t.explored)
      overlay
        .beginFill(0x1b2c29, 0.89)
        .drawRect(t.x * TILE, t.y * TILE, TILE, TILE)
        .endFill();
  }
  for (const group of w.society?.groups ?? []) {
    if (group.extinct !== undefined) continue;
    const marker = new PIXI.Graphics();
    const color = group.id === 'group0' ? 0xe5c77e : 0x82b3c2;
    marker.position.set(group.x * TILE, group.y * TILE);
    marker.lineStyle(2, color).moveTo(53, 50).lineTo(53, 13).lineStyle(0);
    rect(marker, color, 53, 13, 10, 8);
    objects.addChild(marker);
    const name = label(
      group.name.split(' / ')[locale === 'zh' ? 0 : 1] ?? group.name,
      32,
      -8,
      color,
    );
    name.position.set((group.x + 0.5) * TILE, group.y * TILE - 10);
    objects.addChild(name);
  }
  // The executor already delivers here before a granary exists. This is supplies on a mat, not a building.
  if (!w.buildings.some((b) => b.kind === 'granary' && b.condition > 0)) {
    const store = new PIXI.Graphics();
    store.position.set(12 * TILE, 8 * TILE);
    rect(store, 0x9b8b62, 12, 33, 40, 24);
    rect(store, 0xc2b386, 14, 34, 36, 2);
    for (let i = 0; i < Math.min(5, Math.ceil(w.stock.food / 40)); i++) {
      rect(store, 0xb59b61, 16 + i * 6, 39, 5, 11);
      rect(store, 0xe0c188, 17 + i * 6, 39, 3, 2);
    }
    for (let i = 0; i < Math.min(3, Math.ceil(w.stock.wood / 15)); i++)
      rect(store, 0x86603b, 15, 52 + i * 2, 28, 2);
    click(store, { type: 'tile', id: String(8 * 24 + 12) });
    store.zIndex = 8 * TILE + 56;
    objects.addChild(store);
    objects.addChild(
      label(locale === 'zh' ? '公共储藏点' : 'Collective store', 12.5 * TILE, 9 * TILE),
    );
  }
  for (const b of w.buildings.filter((b) => b.condition > 0)) {
    const group = new PIXI.Container();
    group.position.set(b.x * TILE, b.y * TILE);
    group.zIndex = b.y * TILE + 60;
    group.addChild(buildingArt(w, b));
    click(group, { type: 'building', id: b.id });
    const users = alive(w).filter(
      (p) =>
        p.task?.buildingId === b.id &&
        p.x === b.x &&
        p.y === b.y &&
        !['moving', 'waiting'].includes(p.task.phase),
    );
    if (users.length) {
      const use = new PIXI.Graphics();
      rect(use, 0xd7c383, 54, 36, 5, 5);
      group.addChild(use);
    }
    group.addChild(
      label(`${RECIPES[b.kind].name[locale]}${users.length ? ' · ' + users.length : ''}`, 32, 62),
    );
    objects.addChild(group);
    if (selected?.type === 'building' && selected.id === b.id)
      overlay
        .lineStyle(2, 0xffe0a0)
        .drawRect(b.x * TILE, b.y * TILE, TILE, TILE)
        .lineStyle(0);
  }
  for (const p of w.plans.filter(
    (p) => ['planned', 'executing'].includes(p.status) && RECIPES[p.action].building,
  )) {
    const group = new PIXI.Container();
    group.position.set(p.x * TILE, p.y * TILE);
    group.zIndex = p.y * TILE + 61;
    const progress = Math.min(1, p.progress / p.labor),
      g = new PIXI.Graphics();
    if (p.paid) group.addChild(buildingArt(w, { kind: p.action, condition: 1 }, progress));
    g.lineStyle(1, 0xe8cd8d).drawRect(2, 3, 60, 57).lineStyle(0);
    if (p.paid) {
      for (let i = 0; i < 3; i++) rect(g, 0xc1a16c, 3, 45 + i * 4, 15 - i * 2, 3);
      rect(g, 0xa3a18b, 46, 46, 13, 9);
    }
    rect(g, 0x3e4135, 3, 57, 58, 4);
    rect(g, 0xe5c77e, 3, 57, 58 * progress, 4);
    group.addChild(g);
    group.addChild(
      label(
        `${RECIPES[p.action].name[locale]} · ${constructionStage(p)[locale]} ${Math.floor(progress * 100)}%`,
        32,
        63,
      ),
    );
    const present = alive(w).some(
      (person) =>
        person.task?.planId === p.id &&
        person.task.phase === 'working' &&
        person.x === p.x &&
        person.y === p.y,
    );
    if (!present)
      group.addChild(
        label(
          locale === 'zh'
            ? p.paid
              ? '等待到场劳动'
              : '材料未投入'
            : p.paid
              ? 'Awaiting workers'
              : 'Materials unpaid',
          32,
          -11,
          0xe4c18b,
        ),
      );
    click(group, { type: 'plan', id: p.id });
    objects.addChild(group);
  }
  for (const r of w.ruins ?? []) {
    if (occupied.has(`${r.x},${r.y}`)) continue;
    const g = new PIXI.Graphics();
    g.position.set(r.x * TILE, r.y * TILE);
    g.zIndex = r.y * TILE + 40;
    for (let i = 0; i < 6; i++)
      rect(g, i % 2 ? 0x9a8b70 : 0x746e59, 8 + i * 8, 40 - (i % 3) * 5, 7, 8);
    click(g, { type: r.built !== undefined ? 'building' : 'plan', id: r.id });
    objects.addChild(g);
  }
  for (const failed of w.plans.filter(
    (p) =>
      p.status === 'failed' && RECIPES[p.action].building && !w.ruins?.some((r) => r.id === p.id),
  )) {
    if (occupied.has(`${failed.x},${failed.y}`)) continue;
    const g = new PIXI.Graphics();
    g.position.set(failed.x * TILE, failed.y * TILE);
    g.lineStyle(2, 0xc5926e).drawRect(4, 5, 56, 52).moveTo(8, 9).lineTo(56, 53).lineStyle(0);
    click(g, { type: 'plan', id: failed.id });
    objects.addChild(g);
  }
  const living = alive(w);
  for (const [id, sprite] of sprites)
    if (!living.some((p) => p.id === id)) {
      sprite.destroy();
      sprites.delete(id);
      indicators.get(id)?.destroy({ children: true });
      indicators.delete(id);
    }
  for (const p of living) {
    let sprite = sprites.get(p.id);
    if (!sprite) {
      sprite = new PIXI.Sprite(humanTextures[visualIdentity(p.id) % humanTextures.length][0]);
      sprite.anchor.set(0.5, 0.8);
      const pos = personPosition(p);
      sprite.position.set(pos.x, pos.y);
      click(sprite, { type: 'person', id: p.id });
      agents.addChild(sprite);
      sprites.set(p.id, sprite);
    }
    sprite.scale.set(age(p, w.day) < 12 ? 1 : 1.4);
    sprite.tint = p.health < 0.4 ? 0xd49c88 : 0xffffff;
    indicators.get(p.id)?.destroy({ children: true });
    const status = new PIXI.Container();
    status.addChild(activityArt(p));
    if (selected?.type === 'person' && selected.id === p.id) {
      status.addChild(label(p.name, 0, -52));
      status.addChild(label(p.activity[locale], 0, 7));
      if (p.task) {
        overlay.lineStyle(1, 0xe8d095, 0.65).moveTo((p.x + 0.5) * TILE, (p.y + 0.5) * TILE);
        for (const step of p.route?.steps ?? [])
          overlay.lineTo(((step % 24) + 0.5) * TILE, (Math.floor(step / 24) + 0.5) * TILE);
        overlay
          .lineStyle(2, 0xe8d095)
          .drawRect(p.task.x * TILE + 19, p.task.y * TILE + 19, 26, 26)
          .lineStyle(0);
      }
      overlay
        .lineStyle(2, 0xffdf8d)
        .drawRect(p.x * TILE + 14, p.y * TILE + 8, 36, 43)
        .lineStyle(0);
    }
    status.position.copyFrom(sprite.position);
    agents.addChild(status);
    indicators.set(p.id, status);
  }
  if (selected?.type === 'tile') {
    const t = w.tiles[Number(selected.id)];
    if (t)
      overlay
        .lineStyle(2, 0xffdf8d)
        .drawRect(t.x * TILE, t.y * TILE, TILE, TILE)
        .lineStyle(0);
  }
}
