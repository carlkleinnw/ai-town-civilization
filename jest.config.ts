import type { JestConfigWithTsJest } from 'ts-jest';

const jestConfig: JestConfigWithTsJest = {
  preset: 'ts-jest/presets/default-esm',
  // Runtime backups and browser fixtures are evidence, not project test suites.
  roots: ['<rootDir>/convex', '<rootDir>/src'],
};
export default jestConfig;
