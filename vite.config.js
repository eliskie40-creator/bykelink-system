import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const coopHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Cross-Origin-Embedder-Policy': 'unsafe-none',
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    headers: coopHeaders,
    host: '0.0.0.0',
  },
  preview: {
    headers: coopHeaders,
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
})
