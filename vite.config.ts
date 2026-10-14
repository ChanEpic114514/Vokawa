import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  base: './',
  plugins: [react(), VitePWA({
    registerType: 'prompt', injectRegister: 'auto',
    includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'THIRD_PARTY_NOTICES.txt'],
    manifest: { name: 'Vokawa', short_name: 'Vokawa', description: '英语、普通话与粤语翻译及朗读', lang: 'zh-Hans', start_url: './', scope: './', display: 'standalone', background_color: '#f4f6f8', theme_color: '#1d6254', icons: [{src:'icon-192.png',sizes:'192x192',type:'image/png'},{src:'icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]},
    workbox: { runtimeCaching: [{urlPattern: /\/audio\/(?:ekho|words|sentences)\/[a-z0-9-]+\.wav$/, handler: 'CacheFirst', options: {cacheName: 'vokawa-ekho-v9', cacheableResponse: {statuses: [200]}, rangeRequests: true}}], globPatterns: ['**/*.{js,css,html,png,txt,webmanifest}'], maximumFileSizeToCacheInBytes: 8 * 1024 * 1024, navigateFallback: 'index.html', navigateFallbackDenylist: [/\/api\//, /\/(translate|health)$/], cleanupOutdatedCaches: true }
  })],
  server: {proxy: {'/api': {target:'http://127.0.0.1:8765', rewrite: p => p.replace(/^\/api/, '')}}}
});
