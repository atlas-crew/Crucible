import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/bin.ts'],
  format: ['esm'],
  sourcemap: true,
  clean: true,
  target: 'node22',
  splitting: false,
  banner: { js: '#!/usr/bin/env node' },
});
