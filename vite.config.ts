/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The babylon scene is built once in createHubScene and cannot be hot-patched — HMR would leave the
// running scene on old camera/knight code, so edits appear to have "no effect". Force a full page
// reload on any source change instead.
const forceFullReload = {
  name: 'force-full-reload',
  handleHotUpdate({ server, file }: { server: { ws: { send: (m: unknown) => void } }; file: string }) {
    if (file.includes('/tests/')) return;
    server.ws.send({ type: 'full-reload' });
    return [];
  },
};

export default defineConfig({
  plugins: [svelte(), forceFullReload],
  optimizeDeps: { exclude: ['@babylonjs/havok'] },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
