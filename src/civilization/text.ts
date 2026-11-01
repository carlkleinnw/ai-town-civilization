import { Pair, PlanStatus } from '../../convex/civilization/model';
export type Lang = 'zh' | 'en';
export const text = (p: Pair, locale: Lang) => p[locale];
export const date = (day: number, locale: Lang) =>
  locale === 'zh'
    ? `第 ${Math.floor(day / 360) + 1} 年 · ${['春', '夏', '秋', '冬'][Math.floor(day / 90) % 4]} · 第 ${(day % 90) + 1} 天`
    : `Year ${Math.floor(day / 360) + 1} · ${['Spring', 'Summer', 'Autumn', 'Winter'][Math.floor(day / 90) % 4]} · Day ${(day % 90) + 1}`;
export const STATUS: Record<PlanStatus, Pair> = {
  proposed: { zh: '提议', en: 'Proposed' },
  planned: { zh: '计划中', en: 'Planned' },
  executing: { zh: '执行中', en: 'In progress' },
  completed: { zh: '完成', en: 'Completed' },
  failed: { zh: '失败', en: 'Failed' },
  rejected: { zh: '否决', en: 'Rejected' },
};
export const AUTH = {
  human: { zh: '人工决策', en: 'Human decisions' },
  ai: { zh: 'AI 自主', en: 'AI autonomous' },
  mixed: { zh: '混合模式', en: 'Mixed control' },
};
export const PERSIST = {
  locked: { zh: '长期贯彻', en: 'Long-term commitment' },
  node: { zh: '节点调整', en: 'Reassess at nodes' },
  evolving: { zh: '自主演化', en: 'Autonomous evolution' },
};
export const KIND = {
  crisis: { zh: '生存危机', en: 'Survival crisis' },
  direction: { zh: '方向评估', en: 'Direction review' },
  construction: { zh: '重大建设', en: 'Major construction' },
  discovery: { zh: '探索与知识', en: 'Exploration & knowledge' },
};
export const SKILL = {
  gathering: { zh: '采集', en: 'Foraging' },
  building: { zh: '建造', en: 'Building' },
  farming: { zh: '耕作', en: 'Farming' },
  learning: { zh: '学习', en: 'Learning' },
  social: { zh: '协作', en: 'Social' },
};
export const EVENT_KIND: Record<string, Pair> = {
  origin: { zh: '创始', en: 'Origin' },
  strategy: { zh: '发展取向', en: 'Direction' },
  proposal: { zh: '人物提议', en: 'Proposal' },
  decision: { zh: '关键节点', en: 'Decision' },
  construction: { zh: '执行开工', en: 'Work started' },
  achievement: { zh: '实际成果', en: 'Achievement' },
  failure: { zh: '执行失败', en: 'Failure' },
  discovery: { zh: '知识形成', en: 'Discovery' },
  loss: { zh: '知识失传', en: 'Knowledge lost' },
  inheritance: { zh: '家庭传承', en: 'Inheritance' },
  birth: { zh: '新生', en: 'Birth' },
  death: { zh: '逝去', en: 'Death' },
  family: { zh: '家庭', en: 'Family' },
  generation: { zh: '代际更替', en: 'Generation' },
  harvest: { zh: '农业收获', en: 'Harvest' },
  decay: { zh: '建筑损耗', en: 'Decay' },
  extinction: { zh: '文明终止', en: 'Extinction' },
  experiment: { zh: '规则实验', en: 'Rules experiment' },
  'strategy-conflict': { zh: '策略矛盾', en: 'Strategy conflict' },
};
