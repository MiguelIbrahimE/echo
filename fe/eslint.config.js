import js from '@eslint/js';
import react from 'eslint-plugin-react';
import typescriptPlugin from '@typescript-eslint/eslint-plugin'; // Renamed to avoid conflict
import typescriptParser from '@typescript-eslint/parser'; // Renamed to avoid conflict
import prettier from 'eslint-config-prettier';
import globals from 'globals'; // Import globals for Jest

export default [
    { // General configuration for all JS/TS/JSX/TSX files
        files: ['**/*.{js,jsx,ts,tsx}'],
        ignores: [
            'node_modules/**',
            'dist/**',
            '**/vite-env.d.ts' // Often good to ignore Vite's env type file
        ],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parser: typescriptParser, // Use the renamed parser
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
            globals: {
                ...globals.browser, // Use standard browser globals
                // Add any other specific globals your main app code might need
                // fetch: 'readonly', // already in globals.browser
                // localStorage: 'readonly', // already in globals.browser
                // etc.
            },
        },
        plugins: {
            'react': react,
            '@typescript-eslint': typescriptPlugin, // Use the renamed plugin
        },
        rules: {
            ...js.configs.recommended.rules,
            ...react.configs.recommended.rules,
            ...typescriptPlugin.configs.recommended.rules, // Use rules from the plugin
            'react/react-in-jsx-scope': 'off', // Not needed with new JSX transform
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],
            // You can add more specific rules or overrides here
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
    },
    { // Configuration specifically for test files
        files: ['**/*.test.{js,jsx,ts,tsx}', '**/__tests__/**/*.{js,jsx,ts,tsx}'],
        languageOptions: {
            globals: {
                ...globals.jest, // Add Jest global variables
            },
        },
        // You can also apply Jest specific rules here using eslint-plugin-jest if desired
        // plugins: {
        //   jest: jestPlugin,
        // },
        // rules: {
        //   ...jestPlugin.configs.recommended.rules,
        // }
    },
    // Prettier integration should usually be last to override other formatting rules
    prettier,
];