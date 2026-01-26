export default [
    {
        ignores: ['out/**/*.js', 'eslint.config.js']
    },
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'script',
            globals: {
                '$': 'readonly',
                'jQuery': 'readonly',
                'DataTable': 'readonly',
                'moment': 'readonly',
                'bootstrap': 'readonly',
                'window': 'readonly',
                'document': 'readonly',
                'console': 'readonly',
                'fetch': 'readonly',
                'DOMParser': 'readonly',
                'localStorage': 'readonly',
                'URL': 'readonly',
                'Object': 'readonly',
                'JSON': 'readonly',
                'Number': 'readonly',
                'Array': 'readonly',
                'Blob': 'readonly',
                'setTimeout': 'readonly',
                'clearTimeout': 'readonly',
                'Image': 'readonly',
                'confirm': 'readonly',
                'alert': 'readonly'
            }
        },
        rules: {
            'no-unused-vars': 'off',
            'no-useless-escape': 'warn'
        }
    }
];
