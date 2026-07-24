import { defineConfig } from 'astro/config';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5500,
  },
  vite: {
    ssr: {
      external: ['node-fetch']
    }
  }
});
