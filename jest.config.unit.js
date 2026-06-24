export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testMatch: ['**/tests/unit/**/*.test.(js|ts)', '**/src/modules/**/tests/**/*.test.(js|ts)'],
  testPathIgnorePatterns: ['/node_modules/', '\\.api\\.test\\.js$', '\\.integration\\.test\\.js$'],
  setupFiles: ['./tests/setup-env.js'],
  setupFilesAfterEnv: ['./tests/setup.js'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
  transformIgnorePatterns: ['/node_modules/'],
  verbose: false,
};
