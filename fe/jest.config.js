// fe/jest.config.js (or fe/jest.config.ts)

/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // You can add ts-jest specific options here if needed
        // For example, if your tsconfig.json is not at the root or named differently for tests:
        // tsconfig: 'tsconfig.test.json',
      },
    ],
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'], // Ensure this file exists and imports @testing-library/jest-dom
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'], // Added 'json', 'node' for completeness
  testMatch: ['**/__tests__/**/*.(ts|tsx)', '**/?(*.)+(spec|test).(ts|tsx)'],

  // A map from regular expressions to module names or to arrays of module names
  // that allow to stub out resources with a single module. Useful for mocking assets.
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy', // Mocks CSS Modules / CSS imports
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/__mocks__/fileMock.js', // Mock for file assets
  },

  // Automatically clear mock calls, instances and results before every test
  clearMocks: true,

  // Global variables that are available in all test environments
  // THIS IS THE CRUCIAL ADDITION FOR import.meta.env:
  globals: {
    'import.meta': {
      env: {
        VITE_API_BASE_URL: 'http://localhost:7890/mock-api-for-jest', // Provide a mock URL for your tests
        // Add any other VITE_ environment variables your components use:
        // VITE_SOME_OTHER_KEY: 'testValue',
      },
    },
    // If you have specific ts-jest global configurations, they would go under 'ts-jest':
    // 'ts-jest': {
    //   // e.g., diagnostics: { ignoreCodes: [/* specific TS error codes to ignore in tests */] }
    // },
  },
};