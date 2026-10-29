import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * HTTPS on the dev server, enabled with `npm run dev:https`.
 *
 * Not for security - it is a self-signed certificate on a home network. It exists
 * because service workers and PWA install require a *secure context*, and
 * browsers only exempt `localhost`. Over plain HTTP on a LAN address you get the
 * website but never the installable app, so offline behaviour and the install
 * prompt cannot be tested on a real phone at all.
 *
 * The phone will warn about the certificate once; accept it and it is remembered.
 */
const useHttps = process.env.HTTPS === 'true';

export default defineConfig({
  plugins: [
    react(),
    ...(useHttps ? [basicSsl()] : []),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Pollito',
        short_name: 'Pollito',
        description: 'A shared space for two: calendar, lists and money.',
        // `standalone` is what makes it open without browser chrome once
        // installed. Without it the app is a bookmark.
        display: 'standalone',
        theme_color: '#166534',
        background_color: '#ffffff',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          // Without a maskable icon Android renders the icon inside a white box.
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The shell is cached; API calls are not. Caching Supabase responses in
        // the service worker would show stale money after a partner's edit, and
        // the realtime subscription already handles freshness.
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [],
      },
      // Enabled under HTTPS so the service worker can actually be exercised on a
      // phone during development, not only in a production build.
      devOptions: { enabled: useHttps },
    }),
  ],
  server: { host: true },
});
