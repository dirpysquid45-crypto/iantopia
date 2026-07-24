import { defineConfig } from 'astro/config';

export default defineConfig({
  vite: {
    ssr: {
      external: ['node-fetch']
    }
  }
});
