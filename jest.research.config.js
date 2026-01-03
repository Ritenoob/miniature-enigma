module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/research'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/*.test.ts',
    '**/*.property.test.ts'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json'
    }]
  },
  collectCoverageFrom: [
    'research/**/*.ts',
    '!research/**/*.d.ts',
    '!research/**/*.test.ts',
    '!research/scripts/**'
  ],
  moduleNameMapper: {
    '^@research/(.*)$': '<rootDir>/research/$1'
  }
};
