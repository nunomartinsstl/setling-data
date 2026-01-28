import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      // This forces Vite/Rollup to ignore 'jspdf' if it finds it, preventing the build error
      external: ['jspdf']
    }
  }
});