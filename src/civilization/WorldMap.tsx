import { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { characters } from '../../data/characters';
import { World, alive } from '../../convex/civilization/model';
import { useLocale } from '../i18n/LocaleProvider';
import { renderScene, personPosition } from './renderScene';
import { TILE, MAP_WIDTH, MAP_HEIGHT, visualIdentity } from './scene';
import { readLocal, writeLocal } from './navigation';
import { PresentationClock, continuousWalking, motionPosition, presentationHour } from './motion';

export type Selection = { type: 'person' | 'building' | 'plan' | 'tile'; id: string } | null;
export default function WorldMap({
  world,
  selected,
  onSelect,
  storageKey = 'preview',
  following = false,
  presentation,
}: {
  world: World;
  selected: Selection;
  onSelect: (selection: Selection) => void;
  storageKey?: string;
  following?: boolean;
  presentation?: PresentationClock;
}) {
  const host = useRef<HTMLDivElement>(null),
    current = useRef(world),
    choose = useRef(onSelect),
    picked = useRef(selected);
  const timing = useRef({ world, clock: presentation, received: performance.now() });
  if (timing.current.world !== world || timing.current.clock !== presentation)
    timing.current = { world, clock: presentation, received: performance.now() };
  const renderer = useRef<() => void>();
  const camera = useRef<Viewport>();
  const locate = useRef<(x: number, y: number) => void>();
  const follow = useRef(following);
  follow.current = following;
  const [error, setError] = useState(false);
  const { locale } = useLocale();
  const language = useRef(locale);
  language.current = locale;
  current.current = world;
  choose.current = onSelect;
  picked.current = selected;
  useEffect(() => {
    const node = host.current!;
    let app: PIXI.Application;
    try {
      app = new PIXI.Application({
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        backgroundColor: 0x25372b,
        antialias: false,
        resolution: 1,
      });
    } catch {
      setError(true);
      return;
    }
    node.appendChild(app.view as HTMLCanvasElement);
    (app.view as HTMLCanvasElement).setAttribute(
      'aria-label',
      locale === 'zh'
        ? '文明地形地图，可通过人物和建设列表选择实体'
        : 'Civilization map; entities are also available in People and Plans',
    );
    const viewport = new Viewport({
      screenWidth: node.clientWidth,
      screenHeight: node.clientHeight,
      worldWidth: MAP_WIDTH,
      worldHeight: MAP_HEIGHT,
      events: app.renderer.events,
      ticker: app.ticker,
    });
    camera.current = viewport;
    locate.current = (x, y) => {
      const root = node.closest('.civ-world-page');
      const hud = root?.querySelector('.civ-world-hud')?.getBoundingClientRect();
      const panel = root?.querySelector('.civ-world-inspector')?.getBoundingClientRect();
      // The inspector covers part of the canvas; full-canvas clamping would hide the focus.

      const bounds = node.getBoundingClientRect();
      const top = hud ? hud.bottom - bounds.top + 12 : 0;
      const narrow = bounds.width <= 800;
      const controls = root?.querySelector('.civ-locator')?.getBoundingClientRect();
      const bottom = Math.max(
        top + 48,
        panel && narrow
          ? panel.top - bounds.top - 12
          : controls
            ? controls.top - bounds.top - 12
            : bounds.height - 100,
      );
      const right = panel && !narrow ? panel.left - bounds.left : bounds.width;
      const targetX = right / 2,
        targetY = (top + bottom) / 2;
      viewport.moveCenter(
        x + (bounds.width / 2 - targetX) / viewport.scale.x,
        y + (bounds.height / 2 - targetY) / viewport.scale.y,
      );
    };
    app.stage.addChild(viewport);
    viewport.drag().pinch().wheel().clampZoom({ minScale: 0.2, maxScale: 5 });
    let initialized = false;
    viewport.on('moved-end', () => {
      if (initialized)
        writeLocal(
          `civilization-camera-v3-${storageKey}`,
          JSON.stringify({ x: viewport.center.x, y: viewport.center.y, scale: viewport.scale.x }),
        );
    });
    const resizeNow = () => {
      const width = Math.max(1, node.clientWidth),
        height = Math.max(1, node.clientHeight);
      app.renderer.resize(width, height);
      viewport.resize(width, height, MAP_WIDTH, MAP_HEIGHT);
      if (!initialized) {
        initialized = true;
        let saved: { x: number; y: number; scale: number } | null = null;
        try {
          saved = JSON.parse(readLocal(`civilization-camera-v3-${storageKey}`) ?? 'null') as {
            x: number;
            y: number;
            scale: number;
          } | null;
        } catch {
          /* Reset malformed camera only. */
        }
        if (
          saved &&
          Number.isFinite(saved.x) &&
          Number.isFinite(saved.y) &&
          saved.scale >= 0.2 &&
          saved.scale <= 5
        ) {
          viewport.setZoom(saved.scale);
          viewport.moveCenter(saved.x, saved.y);
        } else {
          viewport.setZoom(Math.min(5, Math.max(1, width / MAP_WIDTH, height / MAP_HEIGHT)));
          const people = alive(current.current);
          const center = people.length
            ? {
                x: people.reduce((n, p) => n + p.x, 0) / people.length,
                y: people.reduce((n, p) => n + p.y, 0) / people.length,
              }
            : { x: 12, y: 8 };
          locate.current?.((center.x + 0.5) * TILE, (center.y + 0.5) * TILE);
        }
      }
    };
    resizeNow();
    const resize = new ResizeObserver(resizeNow);
    resize.observe(node);
    const refocus = () => {
      const w = current.current,
        s = picked.current;
      const e =
        s?.type === 'person'
          ? w.people.find((p) => p.id === s.id)
          : s?.type === 'building'
            ? w.buildings.find((b) => b.id === s.id)
            : s?.type === 'plan'
              ? w.plans.find((p) => p.id === s.id)
              : s?.type === 'tile'
                ? w.tiles[Number(s.id)]
                : undefined;
      if (e) locate.current?.((e.x + 0.5) * TILE, (e.y + 0.6) * TILE);
    };
    const panelResize = new ResizeObserver(refocus);
    const root = node.closest('.civ-world-page');
    const observePanels = () =>
      root
        ?.querySelectorAll('.civ-world-hud, .civ-world-inspector')
        .forEach((e) => panelResize.observe(e));
    const panelMount = new MutationObserver(observePanels);
    if (root) panelMount.observe(root, { childList: true });
    observePanels();
    const terrain = new PIXI.Container(),
      objects = new PIXI.Container(),
      agents = new PIXI.Container(),
      overlay = new PIXI.Graphics();
    viewport.addChild(terrain, objects, agents, overlay);
    const humanTextures = characters.map((c) => {
      const base = PIXI.BaseTexture.from(c.textureUrl, { scaleMode: PIXI.SCALE_MODES.NEAREST });
      return [
        'down',
        'down2',
        'down3',
        'left',
        'left2',
        'left3',
        'right',
        'right2',
        'right3',
        'up',
        'up2',
        'up3',
      ].map((key) => {
        const frame = c.spritesheetData.frames[key].frame;
        return new PIXI.Texture(base, new PIXI.Rectangle(frame.x, frame.y, frame.w, frame.h));
      });
    });
    const sprites = new Map<string, PIXI.Sprite>();
    const indicators = new Map<string, PIXI.Container>();
    let downX = 0,
      downY = 0;
    viewport.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      downX = e.global.x;
      downY = e.global.y;
    });
    const select = (selection: Selection, e?: PIXI.FederatedPointerEvent) => {
      if (!e || Math.hypot(e.global.x - downX, e.global.y - downY) < 8) choose.current(selection);
    };

    const draw = () =>
      renderScene({
        w: current.current,
        selected: picked.current,
        locale: language.current,
        terrain,
        objects,
        agents,
        overlay,
        sprites,
        indicators,
        humanTextures,
        select,
      });
    renderer.current = draw;
    draw();
    app.ticker.maxFPS = 30;
    const visibility = () => (document.visibilityState === 'visible' ? app.start() : app.stop());
    document.addEventListener('visibilitychange', visibility);
    visibility();
    agents.sortableChildren = true;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const poses = new Map<
      string,
      { key: string; fraction: number; distance: number; direction: number; x: number; y: number }
    >();
    const diagnostics = new URLSearchParams(window.location.search).has('motion-debug');
    app.ticker.add(() => {
      const w = current.current;
      const t = timing.current;
      const hour = presentationHour(w, t.clock, t.received, performance.now());
      const full = continuousWalking(w);
      const samples: unknown[] = [];
      for (const p of alive(w)) {
        const sprite = sprites.get(p.id);
        if (!sprite) continue;
        const m = p.motion;
        const key = m ? `${m.start}:${m.fromX}:${m.fromY}:${m.toX}:${m.toY}` : '';
        const last = poses.get(p.id);
        const position = motionPosition(p, hour);
        // A partial-second pause or delayed response may lower the time estimate.
        // Preserve progress only on this same reserved edge; never queue catch-up paths.
        if (m && last?.key === key) {
          position.fraction = Math.max(last.fraction, position.fraction);
          position.x = m.fromX + (m.toX - m.fromX) * position.fraction;
          position.y = m.fromY + (m.toY - m.fromY) * position.fraction;
        }
        if (!full && m) {
          position.x = m.fromX;
          position.y = m.fromY;
        }
        const pixel = personPosition({ ...p, x: position.x, y: position.y });
        const dx = last ? position.x - last.x : 0,
          dy = last ? position.y - last.y : 0;
        const distance = Math.hypot(dx, dy);
        const moving = full && w.running && distance > 0.00001 && distance < 1.01;
        const direction = moving
          ? Math.abs(dx) > Math.abs(dy)
            ? dx < 0
              ? 3
              : 6
            : dy < 0
              ? 9
              : 0
          : (last?.direction ?? 0);
        const walked = (last?.distance ?? 0) + (moving ? distance : 0);
        const frame = moving && !reduced ? [0, 1, 0, 2][Math.floor(walked * 12) % 4] : 0;
        sprite.position.set(pixel.x, pixel.y);
        sprite.zIndex = pixel.y;
        sprite.texture =
          humanTextures[visualIdentity(p.id) % humanTextures.length][direction + frame];
        indicators.get(p.id)?.position.set(sprite.x, sprite.y);
        poses.set(p.id, {
          key,
          fraction: position.fraction,
          distance: walked,
          direction,
          x: position.x,
          y: position.y,
        });
        if (follow.current && picked.current?.type === 'person' && picked.current.id === p.id)
          locate.current?.(sprite.x, sprite.y);
        if (diagnostics)
          samples.push({
            id: p.id,
            x: position.x,
            y: position.y,
            px: sprite.x,
            py: sprite.y,
            frame,
            direction,
            moving,
            phase: p.task?.phase,
            motion: m,
          });
      }
      for (const id of poses.keys()) if (!sprites.has(id)) poses.delete(id);
      if (diagnostics)
        node.dataset.motion = JSON.stringify({ hour, full, running: w.running, samples });
    });
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      resize.disconnect();
      panelResize.disconnect();
      panelMount.disconnect();
      if (initialized)
        writeLocal(
          `civilization-camera-v3-${storageKey}`,
          JSON.stringify({ x: viewport.center.x, y: viewport.center.y, scale: viewport.scale.x }),
        );
      camera.current = undefined;
      locate.current = undefined;
      renderer.current = undefined;
      // Viewport must detach its ticker listener before Application destroys that ticker.
      app.stage.removeChild(viewport);
      viewport.destroy({ children: true, texture: false, baseTexture: false });
      app.destroy(true, { children: true, texture: false, baseTexture: false });
    };
    // The persistent renderer reads current state from refs; it is not re-created per tick.
  }, []);
  useEffect(() => {
    renderer.current?.();
  }, [world, selected, locale]);
  useEffect(() => {
    const w = current.current;
    const entity =
      selected?.type === 'building'
        ? w.buildings.find((b) => b.id === selected.id)
        : selected?.type === 'plan'
          ? w.plans.find((p) => p.id === selected.id)
          : selected?.type === 'person'
            ? w.people.find((p) => p.id === selected.id)
            : selected?.type === 'tile'
              ? w.tiles[Number(selected.id)]
              : undefined;
    if (entity) locate.current?.((entity.x + 0.5) * TILE, (entity.y + 0.6) * TILE);
  }, [selected]);
  useEffect(() => {
    host.current
      ?.querySelector('canvas')
      ?.setAttribute(
        'aria-label',
        locale === 'zh'
          ? '文明地形地图，可通过人物和建设列表选择实体'
          : 'Civilization map; entities are also available in People and Plans',
      );
  }, [locale]);
  return (
    <div className="civ-map-canvas" ref={host} data-testid="world-map">
      <div className="civ-map-tools" aria-label={locale === 'zh' ? '地图观察' : 'Map controls'}>
        <button
          aria-label={locale === 'zh' ? '放大地图' : 'Zoom in'}
          onClick={() =>
            camera.current?.setZoom(Math.min(5, (camera.current?.scale.x ?? 1) * 1.25), true)
          }
        >
          +
        </button>
        <button
          aria-label={locale === 'zh' ? '缩小地图' : 'Zoom out'}
          onClick={() =>
            camera.current?.setZoom(Math.max(0.2, (camera.current?.scale.x ?? 1) / 1.25), true)
          }
        >
          −
        </button>
        <button
          onClick={() => {
            camera.current?.setZoom(
              Math.min(
                (host.current?.clientWidth ?? MAP_WIDTH) / MAP_WIDTH,
                (host.current?.clientHeight ?? MAP_HEIGHT) / MAP_HEIGHT,
              ),
            );
            camera.current?.moveCenter(MAP_WIDTH / 2, MAP_HEIGHT / 2);
          }}
        >
          {locale === 'zh' ? '全图' : 'Fit map'}
        </button>
        <span>
          {locale === 'zh' ? '拖动平移 · 滚轮 / 双指缩放' : 'Drag to pan · Scroll / pinch to zoom'}
        </span>
      </div>
      {error && (
        <p role="alert">
          {locale === 'zh'
            ? '地图无法启动，请启用浏览器图形加速。人物与建设仍可从列表查看。'
            : 'Map unavailable. Enable browser graphics acceleration; use lists to inspect entities.'}
        </p>
      )}
    </div>
  );
}
