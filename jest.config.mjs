export default {
    preset: 'ts-jest',
    testEnvironment: 'node',
    setupFiles: ['<rootDir>/tests/setup.ts'],
    testMatch: ['**/tests/**/*.test.ts'],
    moduleNameMapper: {
        '^obsidian$': '<rootDir>/tests/__mocks__/obsidian.ts',
        '^main$': '<rootDir>/main.ts',
        '^linker/(.*)$': '<rootDir>/linker/$1',
    },
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: {
                module: 'CommonJS',
                moduleResolution: 'node',
                target: 'ES2018',
                strict: false,
            },
        }],
    },
};
