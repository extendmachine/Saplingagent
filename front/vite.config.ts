import { defineConfig } from 'vite';

export default defineConfig({
  server: { proxy: { '/api': { target: 'http://127.0.0.1:4310', changeOrigin: false } } },
  preview: { proxy: { '/api': { target: 'http://127.0.0.1:4310', changeOrigin: false } } },
  build: {
    rolldownOptions: {
      onwarn(warning, warn) {
        // This browser SPA does not use React Server Components; omit their dependency directives.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) return;
        warn(warning);
      },
    },
  },
});
