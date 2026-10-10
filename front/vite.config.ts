import { defineConfig } from 'vite';

export default defineConfig({
  server: { proxy: { '/api': { target: 'http://127.0.0.1:4310', changeOrigin: false } } },
  preview: { proxy: { '/api': { target: 'http://127.0.0.1:4310', changeOrigin: false } } },
  build: {
    rolldownOptions: {
      onwarn(warning, warn) {
        // 纯浏览器 SPA 不使用 React Server Components，这些依赖声明无需保留。
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) return;
        warn(warning);
      },
    },
  },
});
