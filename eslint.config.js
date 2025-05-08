import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022
      }
    },
    rules: {
      // Temporarily disable rules that are causing issues in existing code
      'indent': 'off',
      'linebreak-style': ['error', 'unix'],
      'quotes': 'off',
      'semi': ['error', 'always'],
      'no-unused-vars': 'off',
      'no-prototype-builtins': 'off'
    }
  }
];