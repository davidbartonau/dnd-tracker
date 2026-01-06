import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src',
  envDir: '..',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        public: resolve(__dirname, 'src/public/index.html'),
        dm: resolve(__dirname, 'src/dm/index.html'),
        player: resolve(__dirname, 'src/player/index.html'),
      },
    },
  },
  server: {
    port: 3000,
    open: '/public/',
  },
});
