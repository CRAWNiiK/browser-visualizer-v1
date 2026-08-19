import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Multi-page build: the main app and the separate popout window are both
// standalone HTML entries.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        popout: fileURLToPath(new URL('./popout.html', import.meta.url)),
      },
    },
  },
});
