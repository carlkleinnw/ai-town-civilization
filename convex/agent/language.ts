export function conversationLanguagePrompt(language: 'zh' | 'en') {
  return language === 'zh'
    ? '请只用简体中文自然交流，保持角色的性格和目标。即使人物设定、历史聊天或记忆是英文，也要用中文回答。每次回复不超过120个汉字，不要添加角色名或“某某对某某说”的前缀。'
    : 'Reply only in natural English, even if memories or earlier messages use Chinese. Keep your personality and goals. Use a brief reply within 200 characters, without a speaker name prefix.';
}
