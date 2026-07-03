export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testMatch: [
    '**/tests/integration/**/*.test.(js|ts)',
    '**/tests/security/**/*.test.(js|ts)',
    '**/src/modules/**/tests/**/*.api.test.(js|ts)',
    '**/src/modules/**/tests/**/*.integration.test.(js|ts)',
  ],
  setupFiles: ['./tests/setup-env.js'],
  setupFilesAfterEnv: ['./tests/setup.js'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
  transformIgnorePatterns: ['/node_modules/'],
  moduleNameMapper: {
    '^(\\.{2,4})/src/(.*)$': '<rootDir>/src/$2',
  },
  verbose: true,
  testTimeout: 30000,
  forceExit: true,
};
