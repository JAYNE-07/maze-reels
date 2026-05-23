import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://jayne-07.github.io/maze-reels/ on GitHub Pages.
export default defineConfig({
  base: '/maze-reels/',
  plugins: [react()],
});
