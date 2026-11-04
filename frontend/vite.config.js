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
    // Component and logic tests run in a simulated browser (jsdom).
    // Form tests type whole forms character by character; on a busy or slow machine that can pass the 5 s default.
    test: { environment: 'jsdom', include: ['src/**/*.test.{js,jsx}'], restoreMocks: true, setupFiles: ['./src/test/setup.js'], testTimeout: 30000 },
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
