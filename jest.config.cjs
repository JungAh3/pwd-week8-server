/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
  coveragePathIgnorePatterns: ['node_modules', 'src/data'],
  moduleFileExtensions: ['ts', 'js', 'json'],
};
