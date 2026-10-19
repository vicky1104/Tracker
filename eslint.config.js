// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Functions run on Deno with npm: specifiers; they are type-checked separately.
    ignores: ['dist/*', 'supabase/functions/**'],
  },
]);
