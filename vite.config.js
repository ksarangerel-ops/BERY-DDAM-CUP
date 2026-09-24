import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // Use the repository subpath only for GitHub Pages. Keep local dev and
  // preview at the root so `http://localhost:5173/` continues to work.
  base: process.env.GITHUB_ACTIONS ? '/pubg-mobile-cup-2026/' : './',
  server: { host: true, port: 5173 },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      input: {
        home: resolve(process.cwd(), 'index.html'),
        dota2: resolve(process.cwd(), 'dota2.html'),
        cs2: resolve(process.cwd(), 'cs2.html'),
        mobileLegends: resolve(process.cwd(), 'mobile-legends.html'),
        mobileLegendsRules: resolve(process.cwd(), 'mobile-legends-rules.html'),
        additionalGames: resolve(process.cwd(), 'additional-games.html'),
        games: resolve(process.cwd(), 'games.html'),
      },
    },
  },
});
