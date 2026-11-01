import { Action, Pair, Skill, Stock, Strategy, StrategyId, pair } from './model';

export const ACTIONS: Action[] = [
  'gather',
  'logging',
  'quarry',
  'hut',
  'granary',
  'farm',
  'workshop',
  'school',
  'tools',
  'research',
  'teach',
  'explore',
  'trade',
  'defend',
  'council',
  'restore',
];
export type Recipe = {
  name: Pair;
  cost: Partial<Stock>;
  labor: number;
  skill: Skill;
  benefit: Pair;
  uncertainty: Pair;
  building?: boolean;
  needs?: string;
};
export const RECIPES: Record<Action, Recipe> = {
  gather: {
    name: pair('采集食物', 'Forage'),
    cost: {},
    labor: 12,
    skill: 'gathering',
    benefit: pair(
      '从自然地块采集食物，产量取决于存量和劳动',
      'Gather finite wild food through labor',
    ),
    uncertainty: pair('季节、枯竭与健康影响收获', 'Season, depletion and health affect yield'),
  },
  logging: {
    name: pair('采伐木材', 'Collect timber'),
    cost: {},
    labor: 14,
    skill: 'gathering',
    benefit: pair('从林地获取木材', 'Harvest timber from forest'),
    uncertainty: pair('森林恢复缓慢', 'Forests regrow slowly'),
  },
  quarry: {
    name: pair('开采石料', 'Quarry stone'),
    cost: {},
    labor: 16,
    skill: 'gathering',
    benefit: pair('从丘陵开采有限石料', 'Extract finite stone from hills'),
    uncertainty: pair('石料不会自动再生', 'Stone does not regenerate'),
  },
  hut: {
    name: pair('搭建住所', 'Build shelter'),
    cost: { wood: 24, stone: 6 },
    labor: 65,
    skill: 'building',
    building: true,
    benefit: pair(
      '为 6 人提供住所，改善健康与生育条件',
      'Shelter for six, supporting health and families',
    ),
    uncertainty: pair(
      '建设期间占用劳动力，住所逐年损耗',
      'Diverts labor; shelters decay over time',
    ),
  },
  granary: {
    name: pair('修建粮仓', 'Build granary'),
    cost: { wood: 35, stone: 15 },
    labor: 100,
    skill: 'building',
    building: true,
    benefit: pair('增加 220 食物储量并降低腐败', 'Add 220 storage and reduce spoilage'),
    uncertainty: pair('没有食物时粮仓不会产生食物', 'Storage cannot produce food'),
  },
  farm: {
    name: pair('开垦农田', 'Cultivate field'),
    cost: { wood: 12, food: 10 },
    labor: 65,
    skill: 'farming',
    building: true,
    benefit: pair(
      '农人每季播种、照料并等待 90 天收获',
      'Farmers sow, tend and wait 90 days for harvest',
    ),
    uncertainty: pair(
      '需要持续劳动，受季节、土壤与气候影响',
      'Needs ongoing labor, soil and suitable weather',
    ),
  },
  workshop: {
    name: pair('建造工坊', 'Build workshop'),
    cost: { wood: 40, stone: 25 },
    labor: 140,
    skill: 'building',
    building: true,
    benefit: pair('容纳工具制作和试验', 'Provide space for crafting and experiments'),
    uncertainty: pair('本身不赠送工具或技术', 'Does not grant tools or technology'),
  },
  school: {
    name: pair('建立学舍', 'Build school'),
    cost: { wood: 45, stone: 15 },
    labor: 140,
    skill: 'building',
    building: true,
    needs: 'observation',
    benefit: pair('提供知识传授场所，提高教学效率', 'Provide a place for effective teaching'),
    uncertainty: pair('仍需要老师和学生投入时间', 'Still requires teachers and students'),
  },
  tools: {
    name: pair('制作工具', 'Craft tools'),
    cost: { wood: 8, stone: 8 },
    labor: 35,
    skill: 'building',
    benefit: pair(
      '完成后制作 8 件工具，劳动中逐渐磨损',
      'Craft eight tools that wear out with use',
    ),
    uncertainty: pair('占用建筑所需原料', 'Competes for construction materials'),
  },
  research: {
    name: pair('观察与试验', 'Observe & experiment'),
    cost: { wood: 5, stone: 3, food: 4 },
    labor: 65,
    skill: 'learning',
    benefit: pair(
      '积累观察、耕作和储藏知识，需多人多次试验',
      'Accumulate observation, cultivation and storage knowledge',
    ),
    uncertainty: pair(
      '每次试验可能失败，知识可能失传',
      'Experiments may fail; knowledge can be lost',
    ),
  },
  teach: {
    name: pair('传授知识', 'Teach'),
    cost: { food: 3 },
    labor: 35,
    skill: 'learning',
    benefit: pair(
      '老师把已掌握知识传给尚未掌握的人',
      'A living teacher passes knowledge to learners',
    ),
    uncertainty: pair('没有知识持有者便无法传授', 'Requires a living knowledge holder'),
  },
  explore: {
    name: pair('探索迁徙', 'Explore & migrate'),
    cost: { food: 8, tools: 1 },
    labor: 65,
    skill: 'gathering',
    benefit: pair('揭开地形，寻找资源和交换接触', 'Reveal land, resources and exchange contacts'),
    uncertainty: pair('路途消耗补给并可能受伤', 'Travel consumes supplies and risks injury'),
  },
  trade: {
    name: pair('组织交换', 'Organize exchange'),
    cost: { wood: 15 },
    labor: 45,
    skill: 'social',
    benefit: pair(
      '将 15 木材运出换取食物，明确记入交换账本',
      'Transport 15 timber in exchange for food, recorded in ledger',
    ),
    uncertainty: pair(
      '外来商队是简化环境，交换可能失败',
      'Simplified external traders; exchange can fail',
    ),
  },
  defend: {
    name: pair('组织守卫', 'Organize watch'),
    cost: { wood: 10, stone: 5, food: 4 },
    labor: 60,
    skill: 'social',
    benefit: pair(
      '组织轮值减少探索事故，争取群体接受',
      'Organize accepted patrols to reduce expedition injury',
    ),
    uncertainty: pair(
      '占用生产劳动；不代表已实现文明战争',
      'Diverts production labor; no full warfare simulation',
    ),
  },
  council: {
    name: pair('建立议事规则', 'Establish council'),
    cost: { food: 6 },
    labor: 55,
    skill: 'social',
    benefit: pair(
      '提议、讨论与接受后改善协作',
      'Improve coordination after proposal and acceptance',
    ),
    uncertainty: pair('低信任可能导致提案被否决', 'Low trust can cause rejection'),
  },
  restore: {
    name: pair('休耕与育林', 'Restore land'),
    cost: { food: 4 },
    labor: 55,
    skill: 'farming',
    benefit: pair(
      '投入劳动恢复一块土地的肥力与林木',
      'Invest labor to restore one tile’s fertility and trees',
    ),
    uncertainty: pair(
      '恢复占用当期生产，不能立即解决饥饿',
      'Restoration diverts current food production',
    ),
  },
};

const weights = (overrides: Partial<Record<Action, number>>): Record<Action, number> =>
  Object.fromEntries(ACTIONS.map((a) => [a, overrides[a] ?? 0.4])) as Record<Action, number>;
export const STRATEGIES: Record<Exclude<StrategyId, 'custom'>, Strategy> = {
  survival: {
    id: 'survival',
    name: pair('生存与延续', 'Survival & continuity'),
    weights: weights({ gather: 5, hut: 4, tools: 2, teach: 1, farm: 2 }),
    reserveDays: 28,
    harvestLimit: 0.95,
  },
  agriculture: {
    id: 'agriculture',
    name: pair('农业与安居', 'Agriculture & stability'),
    weights: weights({ farm: 6, granary: 4, hut: 3, tools: 2, research: 1.5 }),
    reserveDays: 18,
    harvestLimit: 0.85,
  },
  knowledge: {
    id: 'knowledge',
    name: pair('知识与技术', 'Knowledge & technology'),
    weights: weights({ research: 8, teach: 6, school: 5, workshop: 2, tools: 2 }),
    reserveDays: 8,
    harvestLimit: 0.9,
  },
  expansion: {
    id: 'expansion',
    name: pair('探索与扩张', 'Exploration & expansion'),
    weights: weights({ explore: 7, hut: 2, tools: 2, defend: 1.5 }),
    reserveDays: 12,
    harvestLimit: 0.95,
  },
  trade: {
    id: 'trade',
    name: pair('交换与积累', 'Exchange & wealth'),
    weights: weights({ trade: 8, explore: 3, logging: 3, granary: 2, council: 2 }),
    reserveDays: 12,
    harvestLimit: 0.95,
  },
  military: {
    id: 'military',
    name: pair('力量与竞争', 'Strength & competition'),
    weights: weights({ defend: 7, tools: 3, explore: 2, quarry: 2, council: 1.5 }),
    reserveDays: 10,
    harvestLimit: 0.98,
  },
  ecology: {
    id: 'ecology',
    name: pair('生态与永续', 'Ecology & sustainability'),
    weights: weights({ restore: 8, farm: 3, teach: 2, council: 2 }),
    reserveDays: 18,
    harvestLimit: 0.45,
  },
};
export const TECHS = [
  { id: 'observation', name: pair('环境观察', 'Environmental observation'), threshold: 3 },
  { id: 'cultivation', name: pair('耕作经验', 'Cultivation'), threshold: 7 },
  { id: 'storage', name: pair('储藏方法', 'Food preservation'), threshold: 12 },
];
