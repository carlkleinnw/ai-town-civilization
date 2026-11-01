import path from 'node:path';

const normalized = (value) => (value ?? '').replaceAll('/', '\\').toLowerCase();

// A relative command alone is ambiguous: verify both absolute project children.
export function matchesLauncher(commandLine, childCommands, scriptPath) {
  const command = normalized(commandLine);
  if (command.includes(normalized(scriptPath))) return true;
  if (!/(?:^|[\s"'])scripts\\windows\.mjs(?:[\s"']|$)/.test(command)) return false;
  const root = path.dirname(path.dirname(scriptPath));
  const children = childCommands.map(normalized);
  return ['convex/bin/main.js', 'vite/bin/vite.js'].every(relative => {
    const expected = normalized(path.join(root, 'node_modules', relative));
    return children.some(child => child.includes(expected));
  });
}
