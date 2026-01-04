module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    'server.js'
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/research/'
  ]
};
