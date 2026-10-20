import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from the custom domain root (https://willitprint.io/), so assets are
// requested from '/'. The public/CNAME file tells GitHub Pages to serve this
// build at willitprint.io. (If you ever revert to the github.io/will-it-print/
// project URL, change base back to '/will-it-print/'.)
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: { outDir: 'dist' },
});
