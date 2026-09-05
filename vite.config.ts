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

export default defineConfig(({ mode }) => ({
  plugins: [svelte(), forceFullReload],
  // Honor the port assigned via PORT (preview autoPort); fall back to Vite's default in plain dev.
  server: { port: process.env.PORT ? Number(process.env.PORT) : undefined },
  optimizeDeps: { exclude: ['@babylonjs/havok'] },
  // Under vitest, svelte would otherwise resolve to its server build and mount() throws
  // lifecycle_function_unavailable. Scoped to test mode so dev and build resolve as before.
  resolve: mode === 'test' ? { conditions: ['browser'] } : {},
  test: {
    // node by default: every test but the component ones is a pure function or a file-content
    // guard, and jsdom costs ~14s of setup. The files that need a DOM opt in with
    // `// @vitest-environment jsdom` at the top.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
