import { defineConfig } from 'vite';

// Relative base so the same build runs from the dev server, `vite preview`,
// and a GitHub project page (abhinav-prabhakar.github.io/RailDarshan/).
export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
