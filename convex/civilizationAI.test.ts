import { parseChoice, retryChoice } from './civilizationAI';
describe('model output boundary', () => {
  test('retries an invalid response and records the successful second attempt', async () => {
    let calls = 0;
    const fallback = { action: 'gather' as const, reason: 'Fallback' };
    const result = await retryChoice(async () => {
      await Promise.resolve();
      calls++;
      return parseChoice(calls === 1 ? '{bad json}' : '{"action":"hut","reason":"Shelter"}', [
        'hut',
      ]);
    }, fallback);
    expect(calls).toBe(2);
    expect(result.source).toBe('ollama');
    expect(result.attempts).toBe(2);
    expect(result.choice.action).toBe('hut');
    expect(result.error).not.toBe('');
  });
  test('two timeouts fall back explicitly without changing the supplied strategy action', async () => {
    let calls = 0;
    const fallback = { action: 'research' as const, reason: 'Keep knowledge direction' };
    const result = await retryChoice(() => {
      calls++;
      return Promise.reject(new Error('TimeoutError'));
    }, fallback);
    expect(calls).toBe(2);
    expect(result.source).toBe('rules');
    expect(result.choice).toBe(fallback);
    expect(result.error).toBe('TimeoutError');
  });
  test('accepts only a candidate action and short reason', () => {
    expect(parseChoice('{"action":"hut","reason":"Provide shelter"}', ['hut', 'gather'])).toEqual({
      action: 'hut',
      reason: 'Provide shelter',
    });
  });
  test.each([
    '{"action":"city","reason":"Create a city"}',
    '{"action":"hut","reason":"ok","stock":{"food":99999}}',
    '{"action":"hut","reason":"ok","people":[{}]}',
    '{"action":"hut","reason":"ok","buildings":[{}]}',
    '{"action":"hut","reason":""}',
    '{"action":"hut","reason":"ok","strategy":"godmode"}',
    'null',
    '[]',
    '{not json}',
  ])('rejects invalid or state-writing output: %s', (input) =>
    expect(() => parseChoice(input, ['hut'])).toThrow(),
  );
});
