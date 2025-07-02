module.exports = {
  clearMocks: true,
  moduleFileExtensions: ['js', 'ts'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  testRunner: 'jest-circus/runner',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  verbose: false,
  collectCoverage: true,
  moduleNameMapper: {
    '^sharp$': '<rootDir>/__mocks__/sharp.js',
  },
};
