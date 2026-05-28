export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  coveragePathIgnorePatterns: [
    '/node_modules/'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/e2e/',
    '\\.spec\\.ts$'
  ],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  transformIgnorePatterns: [
    '/node_modules/',
  ],
  verbose: true,
  testMatch: ['**/tests/**/*.test.(js|ts)', '**/?(*.)+(spec|test).(js|ts)'],
  setupFilesAfterEnv: ['./tests/setup.js'],
};
