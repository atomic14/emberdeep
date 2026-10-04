import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5180, strictPort: true, open: false },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 2000 },
  assetsInclude: ['**/*.glb', '**/*.gltf'],
  test: { include: ['tests/**/*.test.ts'] },
} as any);
