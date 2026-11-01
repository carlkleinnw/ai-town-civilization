import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retentionPlan, defaultPolicy, validatePolicy } from './runtime-service.mjs';
test('retention protects critical, recent and minimum copies; preview cannot mutate inputs', () => {
  const now = 100 * 86400000;
  const entries = Array.from({ length: 10 }, (_, i) => ({
    name: String(i),
    time: now - i * 86400000,
    bytes: 100,
    protected: i === 9,
  }));
  const original = structuredClone(entries);
  const plan = retentionPlan(entries, { ...defaultPolicy, keepLast: 3, keepDays: 4 }, now);
  assert.deepEqual(
    plan.filter((e) => e.candidate).map((e) => e.name),
    ['5', '6', '7', '8'],
  );
  assert.deepEqual(entries, original);
  assert.throws(() => validatePolicy({ ...defaultPolicy, keepLast: 0 }));
});
