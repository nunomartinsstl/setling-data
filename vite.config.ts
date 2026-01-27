import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      // These libraries are provided via the Import Map in index.html (CDN)
      // Externalizing them prevents build errors when node_modules is incomplete
      external: ['jspdf', 'jspdf-autotable', 'xlsx'],
      output: {
        globals: {
          jspdf: 'jspdf',
          'jspdf-autotable': 'jspdfAutotable',
          xlsx: 'XLSX'
        }
      }
    }
  }
});