import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';

export default defineConfig([
    globalIgnores(['dist/', 'public/']),
    js.configs.recommended,
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                // Defined by public/lib/ammo/ammo.wasm.js
                Ammo: 'readonly',
            },
        },
        rules: {
            'prefer-const': 'error',
        },
    },
    {
        files: ['*.config.js'],
        languageOptions: { globals: globals.node },
    },
]);
