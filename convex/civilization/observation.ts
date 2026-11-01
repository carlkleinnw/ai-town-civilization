export const OBSERVATION_TIMEOUT_MS = 30000;
export const OBSERVATION_HEARTBEAT_MS = 10000;
export const RESUME_REQUEST_TIMEOUT_MS = 5000;

export function isObserved(observedAt: number | undefined, now: number) {
  return (
    observedAt !== undefined &&
    Number.isFinite(observedAt) &&
    observedAt <= now + 1000 &&
    now - observedAt < OBSERVATION_TIMEOUT_MS
  );
}

export function shouldPauseUnobserved(
  running: boolean,
  observedAt: number | undefined,
  now: number,
) {
  return running && !isObserved(observedAt, now);
}

export function isFreshRequest(sentAt: number | undefined, now: number, timeout: number) {
  return (
    sentAt !== undefined &&
    Number.isFinite(sentAt) &&
    sentAt <= now + 1000 &&
    now - sentAt < timeout
  );
}

export function canResume(
  loop: number,
  expectedLoop: number | undefined,
  requestedAt: number | undefined,
  now: number,
  lastControlAt?: number,
) {
  return (
    loop === expectedLoop &&
    (lastControlAt === undefined || (requestedAt !== undefined && requestedAt > lastControlAt)) &&
    isFreshRequest(requestedAt, now, RESUME_REQUEST_TIMEOUT_MS)
  );
}
