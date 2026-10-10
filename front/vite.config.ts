import { defineConfig } from 'vite';

// Vite 配置运行于 Node；只取启动器提供的端口，不接受外部代理主机。
const agentPort = Number(Reflect.get(globalThis, 'process').env.SEED_AGENT_PORT || '4310');
if (!Number.isInteger(agentPort) || agentPort < 1 || agentPort > 65535) {
  throw new Error('SEED_AGENT_PORT 必须是 1 至 65535 的整数端口。');
}
const agentTarget = `http://127.0.0.1:${agentPort}`;

export default defineConfig({
  server: { proxy: { '/api': { target: agentTarget, changeOrigin: false } } },
  preview: { proxy: { '/api': { target: agentTarget, changeOrigin: false } } },
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
