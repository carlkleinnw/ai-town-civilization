export type Locale = 'zh' | 'en';
export const LOCALE_STORAGE_KEY = 'ai-town.locale';

const en = {
  title: 'AI Town',
  subtitle: 'A virtual town where AI characters live, chat and socialize.',
  language: 'Language',
  languageHint:
    'Changes the interface and new AI replies. Existing messages keep their original text.',
  help: 'Help',
  close: 'Close',
  spectating: 'Explore the town',
  interactivity: 'Join the conversation',
  welcome: 'Welcome to AI Town. Watch the residents or join them as a player.',
  watchHelp:
    'Drag the map to look around, and scroll to zoom. Select a character to read their profile and conversations.',
  joinHelp:
    'Choose “Interact” to enter the town. Your character is highlighted on the map. No login is needed in this local version.',
  talkHelp:
    'Select a free character and choose “Start conversation”. They will walk over to you. You can also accept or decline invitations from residents.',
  inputHelp:
    'Press Enter to send, or Shift+Enter for a new line. Use “Leave conversation” to end a chat, and “Leave” to exit the town.',
  limitHelp:
    'The engine allows up to {count} human players. This local version shares one player identity across tabs. Inactive players leave after five minutes.',
  historyHelp:
    'Language changes apply to new AI replies. Existing messages and memories are preserved.',
  interact: 'Interact',
  leave: 'Leave',
  freeze: 'Freeze',
  unfreeze: 'Unfreeze',
  freezeHint:
    'Pause or resume the town. Residents may take a moment to finish what they are doing.',
  music: 'Music',
  mute: 'Mute',
  musicHint: 'Play or mute background music (M).',
  star: 'Star',
  selectAgent: 'Select a character on the map to see their profile and conversations.',
  startConversation: 'Start conversation',
  waitingAccept: 'Waiting for a reply…',
  walkingOver: 'Walking over…',
  leaveConversation: 'Leave conversation',
  accept: 'Accept',
  reject: 'Decline',
  thisIsYou: 'This is you!',
  conversing: 'Chatting with you',
  previousConversation: 'Previous conversation',
  joined: '{name} joined the conversation.',
  left: '{name} left the conversation.',
  typing: 'Typing…',
  messagePlaceholder: 'Type a message…',
  messageLabel: 'Message',
  send: 'Send',
  sendHint: 'Enter to send · Shift+Enter for a new line',
  sending: 'Sending…',
  reading: 'Reading a book',
  daydreaming: 'Daydreaming',
  gardening: 'Gardening',
  poweredBy: 'Powered by',
  poweredByLabel: 'Powered by Convex',
  login: 'Log in',
  operationFailed: 'That didn’t work. Please try again.',
  alreadyJoined: 'You are already in the town.',
  worldFull: 'The town is full. Please try again later.',
  noPosition: 'Could not find a free spot. Please try entering again.',
  notLoggedIn: 'Please sign in first.',
  unknownCharacter: 'Character assets could not be found: {name}',
  languageFailed:
    'The interface language changed, but AI language could not be updated. Please try again.',
} as const;

export type TranslationKey = keyof typeof en;
const zh: Record<TranslationKey, string> = {
  title: 'AI 小镇',
  subtitle: '在这里，AI 居民会散步、聊天，慢慢熟悉彼此。',
  language: '语言',
  languageHint: '切换界面与 AI 新回复的语言，已有消息保留原文。',
  help: '帮助',
  close: '关闭',
  spectating: '逛逛小镇',
  interactivity: '加入聊天',
  welcome: '欢迎来到 AI 小镇。你可以旁观居民的生活，也可以加入他们。',
  watchHelp: '拖动地图查看周围，滚动鼠标滚轮缩放。点击角色，可以查看介绍和聊天记录。',
  joinHelp: '点击“进入小镇”，地图上会出现带有标记的你的角色。当前本地版本无需登录。',
  talkHelp:
    '选中空闲的居民，点击“发起聊天”，对方会走到你身边。居民也会主动邀请你，你可以接受或婉拒。',
  inputHelp:
    '按回车发送消息，Shift + 回车换行。点击“结束聊天”退出当前对话，点击“离开小镇”退出游戏。',
  limitHelp:
    '引擎最多容纳 {count} 名真人玩家。当前本地版本的多个标签页共用一个玩家身份；玩家闲置五分钟后会自动离开。',
  historyHelp: '切换语言后，AI 的新回复会使用所选语言。已有聊天和记忆会保留，不会自动翻译。',
  interact: '进入小镇',
  leave: '离开小镇',
  freeze: '暂停',
  unfreeze: '继续',
  freezeHint: '暂停或继续小镇。居民可能需要一点时间完成当前动作。',
  music: '音乐',
  mute: '静音',
  musicHint: '播放或关闭背景音乐（快捷键 M）。',
  star: '收藏项目',
  selectAgent: '点击地图上的居民，看看他的介绍和聊天记录。',
  startConversation: '发起聊天',
  waitingAccept: '等待回应…',
  walkingOver: '正在走过来…',
  leaveConversation: '结束聊天',
  accept: '接受邀请',
  reject: '婉拒邀请',
  thisIsYou: '这就是你！',
  conversing: '正在与你聊天',
  previousConversation: '上次的聊天',
  joined: '{name}加入了聊天。',
  left: '{name}离开了聊天。',
  typing: '正在输入…',
  messagePlaceholder: '说点什么吧…',
  messageLabel: '聊天消息',
  send: '发送',
  sendHint: '回车发送 · Shift + 回车换行',
  sending: '发送中…',
  reading: '正在读书',
  daydreaming: '正在发呆',
  gardening: '正在打理花园',
  poweredBy: '技术支持',
  poweredByLabel: '由 Convex 提供技术支持',
  login: '登录',
  operationFailed: '操作未成功，请稍后重试。',
  alreadyJoined: '你已经在小镇里了。',
  worldFull: '小镇暂时满员，请稍后再来。',
  noPosition: '暂时没有找到空位置，请重新进入小镇。',
  notLoggedIn: '请先登录。',
  unknownCharacter: '没有找到角色素材：{name}',
  languageFailed: '界面语言已切换，但 AI 语言暂未更新，请再试一次。',
};

export const catalogs: Record<Locale, Record<TranslationKey, string>> = { zh, en };
export function translate(
  locale: Locale,
  key: TranslationKey,
  values: Record<string, string | number> = {},
) {
  return catalogs[locale][key].replace(/\{(\w+)\}/g, (match, name: string) =>
    String(values[name] ?? match),
  );
}

export function getStoredLocale(): Locale {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY) === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
}

const characterNames: Record<string, string> = {
  Lucky: '拉奇',
  Bob: '鲍勃',
  Stella: '斯黛拉',
  Alice: '爱丽丝',
  Pete: '皮特',
  Me: '我',
};
export function localizeName(locale: Locale, name: string | undefined) {
  return locale === 'zh' ? (characterNames[name ?? ''] ?? name ?? '') : (name ?? '');
}

const descriptions: Record<string, string> = {
  Lucky:
    '拉奇乐观又好奇，最爱吃奶酪。他喜欢读科学史，也爱搭飞船去银河各处旅行。他健谈、耐心、忠诚又勇敢，只是看到松鼠就容易分心。他刚结束一场探索遥远星球的冒险，正迫不及待地和大家分享，也想听听小镇的新鲜事。',
  Bob: '鲍勃脾气有些倔，最喜欢树木和独自打理花园。有人找他说话时，他会回应，但总想尽早结束聊天。他心里一直有个遗憾：自己没能上大学。',
  Stella:
    '斯黛拉很有魅力，也很会利用这份魅力。她常常试着说服别人给她钱，或替她赚钱。她善于掩饰自己的冷漠，与人交往时总想从中获利。',
  Alice:
    '爱丽丝是一位聪明的科学家，研究着旁人难以理解的宇宙奥秘。她说话常常像谜语，看起来有些迷糊、健忘，却始终想弄明白这个世界如何运转。',
  Pete: '皮特有着虔诚的宗教信仰，常从信仰的角度理解身边的事。他聊天时很容易谈起宗教，也希望让更多人接受自己的信仰。',
};
export function localizeDescription(
  locale: Locale,
  name: string | undefined,
  description: string | undefined,
) {
  const isOriginal = Descriptions.some(
    (character) => character.name === name && character.identity === description,
  );
  return locale === 'zh' && isOriginal
    ? (descriptions[name ?? ''] ?? description ?? '')
    : (description ?? '');
}

export function localizeActivity(locale: Locale, description: string) {
  const keys: Record<string, TranslationKey> = {
    'reading a book': 'reading',
    daydreaming: 'daydreaming',
    gardening: 'gardening',
  };
  return keys[description] ? translate(locale, keys[description]) : description;
}

export function translateError(message: string, locale = getStoredLocale()) {
  if (locale === 'en') return message;
  if (message.includes('already in this game')) return translate(locale, 'alreadyJoined');
  if (/Only \d+ human players/.test(message)) return translate(locale, 'worldFull');
  if (message.includes('Failed to find a free position')) return translate(locale, 'noPosition');
  if (message.includes('Not logged in')) return translate(locale, 'notLoggedIn');
  return translate(locale, 'operationFailed');
}
import { Descriptions } from '../../data/characters';
