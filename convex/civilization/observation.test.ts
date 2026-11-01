import {
  isObserved,
  shouldPauseUnobserved,
  OBSERVATION_TIMEOUT_MS,
  canResume,
} from './observation';

describe('civilization observation policy', () => {
  const now = 100000;
  test('unobserved legacy running worlds must pause', () => {
    expect(shouldPauseUnobserved(true, undefined, now)).toBe(true);
  });
  test('recent observation allows the existing server loop, without changing its speed', () => {
    expect(isObserved(now - 10000, now)).toBe(true);
    expect(shouldPauseUnobserved(true, now - 10000, now)).toBe(false);
  });
  test('all observers expiring pauses within thirty seconds', () => {
    expect(isObserved(now - OBSERVATION_TIMEOUT_MS + 1, now)).toBe(true);
    expect(shouldPauseUnobserved(true, now - OBSERVATION_TIMEOUT_MS, now)).toBe(true);
  });
  test('an observation never resumes a manually paused world', () => {
    expect(shouldPauseUnobserved(false, now, now)).toBe(false);
    expect(shouldPauseUnobserved(false, undefined, now)).toBe(false);
  });
  test('an old queued resume cannot overwrite a newer manual pause', () => {
    expect(canResume(4, 4, now - 500, now)).toBe(true);
    expect(canResume(5, 4, now - 500, now)).toBe(false);
    expect(canResume(4, 4, now - 5000, now)).toBe(false);
    expect(canResume(4, undefined, undefined, now)).toBe(false);
    expect(canResume(5, 5, now - 1000, now, now - 500)).toBe(false);
  });
  test('another visible tab refreshing the same world keeps it observed', () => {
    const firstTab = now - 50000,
      otherTab = now - 5000;
    expect(isObserved(Math.max(firstTab, otherTab), now)).toBe(true);
  });
});
