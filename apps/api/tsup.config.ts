import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  // Workspace package ships TS source; inline it into the bundle.
  noExternal: ['@setlist/shared'],
});
