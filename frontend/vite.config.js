import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    define: {
      // Empty = same origin (see services/api.js).
      'process.env.REACT_APP_APIURL': JSON.stringify(env.REACT_APP_APIURL ?? ''),
      'process.env': {}
    },
    build: {
      target: 'es2020',
      sourcemap: false,
      rollupOptions: {
        output: {
          // The framework rarely changes, so keep it in its own long-cached file. The heavy export / PDF libraries
          // (xlsx, jspdf, html2canvas) are loaded on demand and become their own chunks automatically.
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom']
          }
        }
      }
    }
  }
})
