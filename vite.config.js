import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A GitHub Pages PROJECT site is served from a subpath:
//   https://<user>.github.io/will-it-print/
// so assets must be requested from '/will-it-print/', not '/'.
// If you move to a custom domain or a user/org page (served from root),
// change base to '/'.
export default defineConfig({
  base: '/will-it-print/',
  plugins: [react()],
  build: { outDir: 'dist' },
});
