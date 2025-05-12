import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcssPostcss from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  css: {
    postcss: {
      plugins: [
        tailwindcssPostcss(),
        autoprefixer,
      ],
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
})
