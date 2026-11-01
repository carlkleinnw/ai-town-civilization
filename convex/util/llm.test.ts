import { chatCompletion, detectMismatchedLLMProvider, EMBEDDING_DIMENSION, getLLMConfig } from './llm';

describe('Windows local model profile', () => {
  const savedEnv = { ...process.env };
  const savedFetch = globalThis.fetch;

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (/^(OLLAMA_|OPENAI_|TOGETHER_|LLM_)/.test(key)) delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    globalThis.fetch = savedFetch;
    jest.restoreAllMocks();
  });

  test('accepts Ollama with 768 dimensions without demanding a Together API key', () => {
    expect(EMBEDDING_DIMENSION).toBe(768);
    expect(getLLMConfig().embeddingModel).toBe('embeddinggemma:300m');
    expect(() => detectMismatchedLLMProvider()).not.toThrow();
  });

  test('still rejects incompatible OpenAI vector dimensions', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    expect(() => detectMismatchedLLMProvider()).toThrow('EMBEDDING_DIMENSION must be 1536');
  });

  test('passes the local thinking setting to Ollama so short replies have output tokens', async () => {
    process.env.OLLAMA_REASONING_EFFORT = 'none';
    let requestBody: Record<string, unknown> = {};
    globalThis.fetch = jest.fn((_url: string | URL | Request, options?: RequestInit) => {
      requestBody = JSON.parse(options!.body as string) as Record<string, unknown>;
      return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: 'Hello!' } }] })));
    });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const result = await chatCompletion({ messages: [{ role: 'user', content: 'Hello' }] });
    expect(result.content).toBe('Hello!');
    expect(requestBody.reasoning_effort).toBe('none');
  });
});
import { jest } from '@jest/globals';
