import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      // This forces Vite/Rollup to ignore these libraries during the build.
      // The application will load them from the CDN defined in index.html (importmap).
      external: ['jspdf', 'jspdf-autotable']
    }
  }
});