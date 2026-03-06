import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      workbox: {
        // Exclude config.js from precaching — it's generated at runtime
        // and must always be fetched fresh from the server.
        navigateFallbackDenylist: [/^\/config\.js$/],
        runtimeCaching: [
          {
            urlPattern: /\/config\.js$/,
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        name: 'Autism Event Storyboard',
        short_name: 'Storyboard',
        description: 'A multimodal application designed to help parents of autistic children prepare for upcoming events',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})
