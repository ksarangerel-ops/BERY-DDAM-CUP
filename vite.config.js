import { defineConfig } from 'vite';

export default defineConfig({
  // Use the repository subpath only for GitHub Pages. Keep local dev and
  // preview at the root so `http://localhost:5173/` continues to work.
  base: process.env.GITHUB_ACTIONS ? '/pubg-mobile-cup-2026/' : './',
  server: { host: true, port: 5173 },
  build: { outDir: 'dist', sourcemap: false },
});
