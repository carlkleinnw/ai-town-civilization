import { useCallback, useEffect, useRef } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { OBSERVATION_HEARTBEAT_MS } from '../../convex/civilization/observation';

export function useWorldObservation(worldId: Id<'civilizationWorlds'>, running: boolean) {
  const observe = useMutation(api.civilization.observe);
  const pending = useRef(false);
  const refresh = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    return await observe({ worldId, sentAt: Date.now() });
  }, [observe, worldId]);
  useEffect(() => {
    if (!running) return;
    const beat = () => {
      if (pending.current || document.visibilityState !== 'visible') return;
      pending.current = true;
      void refresh()
        .catch(() => {
          /* Reconnection never resumes the simulation. */
        })
        .finally(() => {
          pending.current = false;
        });
    };
    beat();
    const timer = window.setInterval(beat, OBSERVATION_HEARTBEAT_MS);
    document.addEventListener('visibilitychange', beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [running, refresh]);
  return refresh;
}
