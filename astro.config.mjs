import { defineConfig } from 'astro/config';

export default defineConfig({
  // The dev toolbar docks at the bottom centre and sits on top of every fixed
  // bottom bar (Battleship's Place / Fire buttons, the village's placement bar),
  // swallowing taps meant for them while testing locally. Dev-only: it is never
  // part of a production build.
  devToolbar: { enabled: false },
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
