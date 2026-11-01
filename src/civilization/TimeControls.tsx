import { useMutation } from 'convex/react';
import { useEffect, useRef } from 'react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { World } from '../../convex/civilization/model';
import { SPEEDS } from '../../convex/civilization/clock';
import { useLocale } from '../i18n/LocaleProvider';
import { useWorldObservation } from './useWorldObservation';
import { isFreshRequest, RESUME_REQUEST_TIMEOUT_MS } from '../../convex/civilization/observation';

export default function TimeControls({
  w,
  worldId,
  busy,
  report,
  pauseReason,
}: {
  w: World;
  worldId: Id<'civilizationWorlds'>;
  busy: boolean;
  report: (work: () => Promise<unknown>) => Promise<void>;
  pauseReason?: 'manual' | 'unobserved' | null;
}) {
  const { locale } = useLocale(),
    zh = locale === 'zh';
  const control = useMutation(api.civilization.control);
  const observe = useWorldObservation(worldId, w.running);
  const lifecycle = useRef(0);
  useEffect(() => {
    lifecycle.current++;
    return () => {
      lifecycle.current++;
    };
  }, [worldId]);
  return (
    <div className="civ-time-controls">
      <span
        className={`civ-live ${w.running ? 'running' : ''}`}
        title={
          zh
            ? '离开所有观察页面30秒后自动保存暂停，回来需手动继续'
            : 'Auto-saves and pauses after 30 seconds without a visible world page; resume manually'
        }
      >
        {w.endReason
          ? zh
            ? '文明终止'
            : 'Extinct'
          : w.running
            ? zh
              ? '运行中'
              : 'Running'
            : pauseReason === 'unobserved'
              ? zh
                ? '无人观察，已暂停'
                : 'Auto-paused'
              : zh
                ? '已暂停'
                : 'Paused'}
      </span>
      <button
        className="civ-primary"
        disabled={busy || !!w.endReason}
        onClick={() =>
          void report(async () => {
            if (w.running) {
              await control({ worldId, running: false });
              return;
            }
            const generation = lifecycle.current,
              requestedAt = Date.now();
            const observation = await observe();
            if (
              !observation ||
              generation !== lifecycle.current ||
              document.visibilityState !== 'visible' ||
              !isFreshRequest(requestedAt, Date.now(), RESUME_REQUEST_TIMEOUT_MS)
            )
              throw new Error(
                zh
                  ? '继续请求已过期，请重新点击继续'
                  : 'Resume request expired; click Resume again',
              );
            await control({ worldId, running: true, expectedLoop: observation.loop, requestedAt });
          })
        }
      >
        {w.running ? (zh ? '暂停' : 'Pause') : zh ? '继续' : 'Resume'}
      </button>
      <label className="civ-speed">
        {zh ? '速度' : 'Speed'}
        <select
          aria-label={zh ? '模拟速度' : 'Simulation speed'}
          disabled={busy}
          value={w.speed}
          onChange={(e) => void report(() => control({ worldId, speed: +e.target.value }))}
        >
          {SPEEDS.map((n) => (
            <option value={n} key={n}>
              {n}×
            </option>
          ))}
        </select>
      </label>
      {w.running && w.clock?.limited && (
        <span role="status">
          {zh ? '已达运算上限，限量推进' : 'Processing limit; simulation slowed'}
        </span>
      )}
    </div>
  );
}
