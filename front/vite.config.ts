import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'SEED_');
  return {
  server: { proxy: { '/api/runtime': { target: `http://127.0.0.1:${env.SEED_RUNTIME_MANAGER_PORT || 4314}`, changeOrigin: false }, '/api': { target: `http://127.0.0.1:${env.SEED_AGENT_PORT || 4310}`, changeOrigin: false } } },
  preview: { proxy: { '/api/runtime': { target: `http://127.0.0.1:${env.SEED_RUNTIME_MANAGER_PORT || 4314}`, changeOrigin: false }, '/api': { target: `http://127.0.0.1:${env.SEED_AGENT_PORT || 4310}`, changeOrigin: false } } },
  build: {
    rolldownOptions: {
      onwarn(warning, warn) {
        // This browser SPA does not use React Server Components; omit their dependency directives.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) return;
        warn(warning);
      },
    },
  },
  };
});
