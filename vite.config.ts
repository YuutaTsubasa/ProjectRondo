/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  optimizeDeps: { exclude: ['@babylonjs/havok'] },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
