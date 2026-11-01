import { matchesLauncher } from '../../scripts/windowsProcess.mjs';
import path from 'node:path';
const root = path.resolve('E:/AI_town/ai-town');
const script = path.join(root, 'scripts/windows.mjs');
const children = ['convex/bin/main.js dev', 'vite/bin/vite.js --host 127.0.0.1'].map(s => `node ${path.join(root, 'node_modules', s)}`);
describe('Windows launcher identity', () => {
  test('recognizes the absolute CMD launch', () => expect(matchesLauncher(`node "${script}" --open`, [], script)).toBe(true));
  test('recognizes npm/relative launch only with both project children', () => expect(matchesLauncher('node scripts/windows.mjs', children, script)).toBe(true));
  test('does not stop a different project with the same relative command', () => expect(matchesLauncher('node scripts/windows.mjs', children.map(c => c.replace('ai-town', 'other-project')), script)).toBe(false));
  test('does not trust relative text with missing child proof', () => expect(matchesLauncher('node scripts/windows.mjs', children.slice(0, 1), script)).toBe(false));
  test('does not stop an unrelated command', () => expect(matchesLauncher('node some-other-app.js', children, script)).toBe(false));
  test('handles mixed separators and case', () => expect(matchesLauncher('node scripts\\windows.mjs', children.map(c => c.toUpperCase().replaceAll('\\', '/')), script.toUpperCase())).toBe(true));
});
