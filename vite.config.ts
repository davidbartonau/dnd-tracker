import { defineConfig } from 'vite';
import { resolve } from 'path';
import { execSync } from 'child_process';

// Get git SHA and build date at build time
const getGitSha = () => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
};

const getBuildDate = () => {
  return new Date().toISOString().split('T')[0];
};

export default defineConfig({
  root: 'src',
  envDir: '..',
  publicDir: '../public',
  define: {
    __BUILD_SHA__: JSON.stringify(getGitSha()),
    __BUILD_DATE__: JSON.stringify(getBuildDate()),
  },
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
