import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The proxy forwards /ollama/* to the local Ollama server, so no CORS setup is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ollama': {
        target: 'http://localhost:11434',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ollama/, ''),
        timeout: 0,
        proxyTimeout: 0
      }
    }
  }
})
