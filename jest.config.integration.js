export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testMatch: ['**/tests/integration/**/*.test.(js|ts)'],
  setupFilesAfterEnv: ['./tests/setup.js'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      { useESM: true },
    ],
  },
  transformIgnorePatterns: ['/node_modules/'],
  verbose: true,
  testTimeout: 30000,
};
