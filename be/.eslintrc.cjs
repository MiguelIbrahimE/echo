/* be/.eslintrc.cjs */
module.exports = {
    root: true,
    env: { node: true, es2021: true },
    // share the same parser / ts config as root:
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
    ],
    /* optional – tell ESLint “process” is readonly global */
    globals: { process: 'readonly' },
};
