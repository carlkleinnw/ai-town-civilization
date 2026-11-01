import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { RECIPES, STRATEGIES } from './civilization/catalog';
import { Action, StrategyId } from './civilization/model';
import { hashSeed } from './civilization/random';

type Choice = { action: Action; reason: string; reasonEn?: string; strategy?: StrategyId };
export async function retryChoice(request: () => Promise<Choice>, fallback: Choice) {
  let error = '';
  for (let attempts = 1; attempts <= 2; attempts++) {
    try {
      return { choice: await request(), source: 'ollama' as const, attempts, error };
    } catch (e) {
      error = e instanceof Error ? e.message.slice(0, 200) : 'Model error';
    }
  }
  return { choice: fallback, source: 'rules' as const, attempts: 2, error };
}

export function parseChoice(text: string, options: Action[]) {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Model choice must be an object');
  const parsed = value as Record<string, unknown>;
  if (
    Object.keys(parsed).some((k) => !['action', 'reason', 'reasonEn', 'strategy'].includes(k)) ||
    typeof parsed.action !== 'string' ||
    !options.includes(parsed.action as Action) ||
    typeof parsed.reason !== 'string' ||
    !parsed.reason.trim() ||
    parsed.reason.length > 1000 ||
    (parsed.reasonEn !== undefined &&
      (typeof parsed.reasonEn !== 'string' || parsed.reasonEn.length > 1000)) ||
    (parsed.strategy !== undefined &&
      (typeof parsed.strategy !== 'string' || !Object.keys(STRATEGIES).includes(parsed.strategy)))
  )
    throw new Error('Model returned an invalid structured choice');
  return parsed as { action: Action; reason: string; reasonEn?: string; strategy?: StrategyId };
}

export const decide = internalAction({
  args: { worldId: v.id('civilizationWorlds') },
  handler: async (ctx, { worldId }): Promise<void> => {
    const token = crypto.randomUUID();
    const input = await ctx.runMutation(internal.civilization.claim, { worldId, token });
    if (!input) return;
    const config = await ctx.runQuery(internal.civilization.modelConfig, {});
    const context = JSON.stringify({
      model: config.model,
      host: config.host,
      day: input.day,
      population: input.population,
      stock: input.stock,
      climate: input.climate,
      environment: input.environment,
      strategy: input.strategy,
      persistence: input.persistence,
      kind: input.decision.kind,
      options: input.decision.options,
    });
    const key = hashSeed(context),
      cachedText = await ctx.runQuery(internal.civilization.cachedChoice, { key, context });
    let choice = {
      action: input.decision.recommendation,
      reason: `模型不可用，规则按既定策略“${input.strategy.name.zh}”选择可行行动。`,
      reasonEn: `Model unavailable; rules choose a feasible action for ${input.strategy.name.en}.`,
    } as { action: Action; reason: string; reasonEn?: string; strategy?: StrategyId };
    let source: 'rules' | 'ollama' = 'rules',
      error = '',
      attempts = 0;
    let cached = false;
    if (cachedText)
      try {
        choice = parseChoice(cachedText, input.decision.options);
        source = 'ollama';
        cached = true;
      } catch {
        /* Invalid cache is treated as a miss. */
      }
    if (!cached) {
      const result = await retryChoice(async () => {
        const response = await fetch(`${config.host}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(22000),
          body: JSON.stringify({
            model: config.model,
            stream: false,
            think: false,
            keep_alive: '5m',
            options: { temperature: 0, seed: input.day, num_predict: 380 },
            format: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: input.decision.options },
                reason: { type: 'string' },
                reasonEn: { type: 'string' },
                strategy: { type: 'string', enum: Object.keys(STRATEGIES) },
              },
              required: ['action', 'reason', 'reasonEn'],
              additionalProperties: false,
            },
            messages: [
              {
                role: 'system',
                content:
                  '你是文明模拟的集体决策者。只选择一个候选行动，给出简短中文 reason 和英文 reasonEn（各不超过两句），说明收益、机会成本或风险。不得发明已完成成果，不得修改库存或人口。核心策略在 locked 模式绝不能改变；evolving 模式可提出 strategy 字段；node 模式仅在 direction 或 crisis 节点可提出 strategy 字段。不要输出内部思考，只输出 JSON。',
              },
              {
                role: 'user',
                content: JSON.stringify({
                  ...input,
                  options: input.decision.options.map((action: Action) => ({
                    action,
                    cost: RECIPES[action].cost,
                    labor: RECIPES[action].labor,
                    benefit: RECIPES[action].benefit.zh,
                    risk: RECIPES[action].uncertainty.zh,
                  })),
                }),
              },
            ],
          }),
        });
        if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
        const data = (await response.json()) as { message?: { content?: string } };
        return parseChoice(data.message?.content ?? '', input.decision.options);
      }, choice);
      choice = result.choice;
      source = result.source;
      attempts = result.attempts;
      error = result.error;
      // A failed optimization must not discard a valid model decision.
      if (source === 'ollama')
        try {
          await ctx.runMutation(internal.civilization.cacheChoice, {
            key,
            context,
            choice: JSON.stringify(choice),
          });
        } catch {
          /* Choice is still usable without a cache write. */
        }
    }
    await ctx.runMutation(internal.civilization.finish, {
      worldId,
      token,
      decisionId: input.decision.id,
      revision: input.decision.revision,
      selected: choice.action,
      reason: choice.reason,
      ...(choice.reasonEn ? { reasonEn: choice.reasonEn } : {}),
      ...(choice.strategy ? { suggestedStrategy: choice.strategy } : {}),
      attempts,
      cached,
      model: config.model,
      ...(error ? { error } : {}),
      source,
    });
  },
});
