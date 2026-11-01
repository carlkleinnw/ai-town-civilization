import { Descriptions } from '../../data/characters';
import { localizeDescription, localizeName, translate, translateError } from './catalog';

describe('Bilingual compatibility', () => {
  test('interpolates names and numbers without changing user text', () => {
    expect(translate('zh', 'joined', { name: '小明' })).toBe('小明加入了聊天。');
    expect(translate('en', 'limitHelp', { count: 8 })).toContain('8 human players');
    expect(localizeName('zh', '自定义角色')).toBe('自定义角色');
  });
  test('localizes original characters but preserves edited biographies', () => {
    const lucky = Descriptions.find((character) => character.name === 'Lucky')!;
    expect(localizeDescription('zh', lucky.name, lucky.identity)).toContain('拉奇');
    expect(localizeDescription('en', lucky.name, lucky.identity)).toBe(lucky.identity);
    expect(localizeDescription('zh', lucky.name, 'My custom character biography')).toBe(
      'My custom character biography',
    );
  });
  test('turns common engine errors into useful Chinese messages', () => {
    expect(translateError('You are already in this game!', 'zh')).toBe('你已经在小镇里了。');
    expect(translateError('Only 8 human players allowed at once.', 'zh')).toContain('满员');
    expect(translateError('Unknown error', 'en')).toBe('Unknown error');
  });
});
