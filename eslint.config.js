import js from '@eslint/js';
import parser from '@typescript-eslint/parser';
import typescript from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist', 'node_modules', '.npm-cache'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser },
    plugins: { '@typescript-eslint': typescript, 'react-hooks': reactHooks },
    rules: {
      ...typescript.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'warn',
      'no-undef': 'off',
      'preserve-caught-error': 'off',
    },
  },
  { files: ['*.config.ts'], languageOptions: { parser }, rules: { 'no-undef': 'off' } },
];
