import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/bin.ts'],
  format: ['esm'],
  sourcemap: true,
  clean: true,
  target: 'node22',
  splitting: false,
});
