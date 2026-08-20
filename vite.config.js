import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Multi-page build: the main app and the separate popout window are both
// standalone HTML entries.
export default defineConfig({
  // Relative base so the built assets resolve under any path (local dev
  // serves at /, GitHub Pages serves at /<repo>/).
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        popout: fileURLToPath(new URL('./popout.html', import.meta.url)),
      },
    },
  },
});
