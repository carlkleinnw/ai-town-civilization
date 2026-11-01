export type Pair = { zh: string; en: string };
export type Resource = 'food' | 'wood' | 'stone' | 'tools';
export type Stock = Record<Resource, number>;
export type Action =
  | 'gather'
  | 'logging'
  | 'quarry'
  | 'hut'
  | 'granary'
  | 'farm'
  | 'workshop'
  | 'school'
  | 'tools'
  | 'research'
  | 'teach'
  | 'explore'
  | 'trade'
  | 'defend'
  | 'council'
  | 'restore';
export type StrategyId =
  | 'survival'
  | 'agriculture'
  | 'knowledge'
  | 'expansion'
  | 'trade'
  | 'military'
  | 'ecology'
  | 'custom';
export type Authority = 'human' | 'ai' | 'mixed';
export type Persistence = 'locked' | 'node' | 'evolving';
export type DecisionKind = 'crisis' | 'direction' | 'construction' | 'discovery';
export type Strategy = {
  id: StrategyId;
  name: Pair;
  weights: Record<Action, number>;
  reserveDays: number;
  harvestLimit: number;
};
export type Tile = {
  x: number;
  y: number;
  terrain: 'grass' | 'forest' | 'water' | 'hill';
  food: number;
  wood: number;
  stone: number;
  fertility: number;
  explored: boolean;
  land?: Land;
  lastChange?: { id: string; day: number; cause: string; people: string[] };
  control?: { groupId: string; since: number; cause: string };
  lastHarvest?: { day: number; hour: number; personId: string; resource: Resource; amount: number };
  lastRestored?: {
    day: number;
    planId: string;
    fertilityBefore: number;
    fertilityAfter: number;
    woodAdded: number;
  };
};
export type Skill = 'gathering' | 'building' | 'farming' | 'learning' | 'social';
export type Person = {
  id: string;
  name: string;
  sex: 'f' | 'm';
  born: number;
  died?: number;
  cause?: Pair;
  generation: number;
  parents: string[];
  children: string[];
  partner?: string;
  lastBirth: number;
  personality: { cooperation: number; curiosity: number; resilience: number };
  values: { security: number; learning: number; autonomy: number };
  interests: Skill[];
  goal: Pair;
  skills: Record<Skill, number>;
  known: string[];
  health: number;
  hunger: number;
  fatigue: number;
  mood: number;
  illness: number;
  x: number;
  y: number;
  activity: Pair;
  job: Action | 'rest' | 'child';
  task?: {
    phase: 'moving' | 'working' | 'hauling' | 'resting' | 'family' | 'waiting' | 'delivered';
    x: number;
    y: number;
    planId?: string;
    buildingId?: string;
    landProjectId?: string;
    socialProposalId?: string;
    missionId?: string;
  };
  carrying?: { resource: Resource; amount: number };
  groupId?: string;
  assets?: Stock;
  laborCredit?: number;
  grievance?: number;
  lastExecution?: {
    day: number;
    hour: number;
    x: number;
    y: number;
    kind: 'harvest' | 'delivery' | 'labor' | 'sowing' | 'care' | 'learning' | 'rest';
    resource?: Resource;
    amount?: number;
    planId?: string;
  };
  assignment?: { day: number; willing: boolean; job?: Action };
  route?: { x: number; y: number; steps: number[] };
  // A reserved edge, not a frontend prediction. Coordinates commit on arrival.
  motion?: { fromX: number; fromY: number; toX: number; toY: number; start: number; end: number };
  relationships: { person: string; affinity: number }[];
  memories: { day: number; text: Pair; important?: boolean }[];
};
export type PlanStatus = 'proposed' | 'planned' | 'executing' | 'completed' | 'failed' | 'rejected';
export type Plan = {
  id: string;
  groupId?: string;
  action: Action;
  strategy: StrategyId;
  strategyName: Pair;
  trigger: Pair;
  reason: Pair;
  status: PlanStatus;
  created: number;
  started?: number;
  finished?: number;
  cost: Partial<Stock>;
  paid: boolean;
  labor: number;
  progress: number;
  lastLabor?: { day: number; hour: number; personId: string; amount: number };
  workers: string[];
  x: number;
  y: number;
  expected: Pair;
  outcome?: Pair;
  source: 'rules' | 'ollama' | 'human';
  humanInfluenced?: boolean;
};
export type Building = {
  id: string;
  kind: Action;
  x: number;
  y: number;
  planId: string;
  built: number;
  condition: number;
  cropDay?: number;
  cropLabor?: number;
  uses?: number;
  lastUsed?: number;
  users?: string[];
  groupId?: string;
};
export type Technology = {
  id: string;
  progress: number;
  discovered?: number;
  lost?: number;
  contributors: string[];
};
export type CivEvent = {
  id: string;
  day: number;
  kind: string;
  text: Pair;
  actor: 'simulation' | 'human' | 'ollama' | 'rules';
  people: string[];
  evidence?: Record<string, unknown>;
};
export type Decision = {
  id: string;
  day: number;
  kind: DecisionKind;
  trigger: Pair;
  options: Action[];
  recommendation: Action;
  status: 'queued' | 'waiting' | 'resolved';
  selected?: Action;
  source?: 'rules' | 'ollama' | 'human';
  reason?: Pair;
  attempts: number;
  model?: string;
  error?: string;
  cached?: boolean;
  revision: number;
};
export type Audit = {
  id: string;
  day: number;
  at: string;
  actor: 'human' | 'ai';
  reason: string;
  before: string;
  after: string;
};
export type Sample = {
  day: number;
  population: number;
  births: number;
  deaths: number;
  food: number;
  health: number;
  buildings: number;
  knowledge: number;
  wood: number;
  soil: number;
  groups?: number;
  disputes?: number;
  landLabor?: number;
  privateFoodShare?: number;
};
export type Ledger = {
  initial: Stock;
  gathered: Stock;
  produced: Stock;
  consumed: Stock;
  spent: Stock;
  spoiled: Stock;
  injected: Stock;
  tradedIn: Stock;
  tradedOut: Stock;
};
export type World = {
  version: 1;
  name: string;
  seed: string;
  rng: number;
  day: number;
  nextId: number;
  revision: number;
  running: boolean;
  speed: number;
  clock?: {
    version: 2;
    hour: number;
    budget: number;
    secondsPerDay: number;
    limited: boolean;
  };
  era?: string;
  ruins?: {
    id: string;
    kind: Action;
    x: number;
    y: number;
    day: number;
    planId?: string;
    built?: number;
  }[];
  stopDay: number | null;
  endReason: Pair | null;
  authority: Authority;
  persistence: Persistence;
  humanKinds: DecisionKind[];
  strategy: Strategy;
  populationCap: number;
  climate: number;
  tiles: Tile[];
  landProjects?: LandProject[];
  landLaborTotal?: number;
  society?: Society;
  people: Person[];
  stock: Stock;
  ledger: Ledger;
  ledgerCompensation?: Record<string, number>;
  buildings: Building[];
  plans: Plan[];
  technologies: Technology[];
  institutions: string[];
  decisions: Decision[];
  events: CivEvent[];
  audits: Audit[];
  samples: Sample[];
  births: number;
  deaths: number;
  lastDecision: number;
  lastCrisis: number;
  tradeContacts: number;
  branch?: { parent: string; day: number };
  onlinePolicy: 'no-catch-up';
  humanInterventions?: number;
};
export type Land = {
  base: 'plain' | 'hill' | 'water';
  vegetation: number;
  use: 'wild' | 'field' | 'road' | 'settlement' | 'quarry' | 'fallow';
  degradation: number;
  terraces: number;
  traffic: number;
  worked?: number;
  revision: number;
};
export type LandAction = 'clear' | 'cultivate' | 'road' | 'reforest' | 'terrace' | 'level';
export type LandProject = {
  id: string;
  groupId?: string;
  action: LandAction;
  tile: number;
  created: number;
  source: 'rules' | 'human' | 'ollama';
  reason: string;
  status: 'planned' | 'working' | 'completed' | 'cancelled' | 'blocked';
  labor: number;
  progress: number;
  paid: boolean;
  cost: Partial<Stock>;
  spent: Partial<Stock>;
  workers: string[];
  before: Land & { wood: number; fertility: number; stone: number };
  finished?: number;
  lastLabor?: { hour: number; personId: string; amount: number };
};
export type SocialRules = {
  property: 'common' | 'household' | 'steward';
  distribution: 'need' | 'equal' | 'effort';
  decision: 'assembly' | 'mandate' | 'hereditary';
  tax: number;
  obligation: number;
  inheritance: 'family' | 'common';
  migration: 'free' | 'consent';
};
export type Group = {
  id: string;
  name: string;
  founded: number;
  parent?: string;
  x: number;
  y: number;
  rules: SocialRules;
  treasury: Stock;
  leader?: string;
  lastElection: number;
  legitimacy: number;
  evidence: string[];
  extinct?: number;
  concentration?: { since: number; controller: string; foodShare: number };
};
export type SocialProposal = {
  id: string;
  groupId: string;
  proposer: string;
  created: number;
  reason: string;
  source: 'rules' | 'human' | 'ollama';
  patch: Partial<SocialRules>;
  status: 'discussion' | 'adopted' | 'rejected' | 'expired';
  supporters: string[];
  opponents: string[];
  progress: number;
  labor: number;
  before: SocialRules;
  after?: SocialRules;
  spent: Partial<Stock>;
  finished?: number;
};
export type Relation = {
  a: string;
  b: string;
  trust: number;
  grievance: number;
  state: 'neutral' | 'alliance' | 'truce' | 'war';
  since: number;
  traded: number;
  negotiated: number;
  lastContact: number;
};
export type Mission = {
  id: string;
  kind: 'migration' | 'envoy' | 'trade' | 'raid';
  groupId: string;
  targetGroup?: string;
  target: number;
  people: string[];
  created: number;
  reason: string;
  status: 'assembling' | 'travelling' | 'acting' | 'returning' | 'completed' | 'failed';
  supplies: number;
  equipment: number;
  cargo: Stock;
  progress: number;
  losses: string[];
  casualties: string[];
  spent: Stock;
  lastAction?: number;
  claim?: number;
  childGroup?: string;
};
export type Society = {
  version: 1;
  groups: Group[];
  proposals: SocialProposal[];
  relations: Relation[];
  missions: Mission[];
  lastReview: number;
};
export const pair = (zh: string, en: string): Pair => ({ zh, en });
export const emptyStock = (): Stock => ({ food: 0, wood: 0, stone: 0, tools: 0 });
export const alive = (w: World) => w.people.filter((p) => p.died === undefined);
export const age = (p: Person, day: number) => ((p.died ?? day) - p.born) / 360;
export const adults = (w: World) =>
  alive(w).filter((p) => age(p, w.day) >= 16 && age(p, w.day) < 65);
