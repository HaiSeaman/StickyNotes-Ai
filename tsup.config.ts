import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    main: 'main.js',
    preload: 'preload.js',
    'popout-preload': 'src/preload/popout-preload.ts'
  },
  outDir: 'dist',
  format: ['cjs'],
  target: 'node18',
  clean: true,
  shims: false,
  dts: false,
  sourcemap: true,
  external: ['electron']
});
