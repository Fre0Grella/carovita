import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` deve combaciare con il nome della repository: su GitHub Pages il
// sito e' servito da https://<utente>.github.io/carovita/ e senza questo
// prefisso tutti gli asset verrebbero cercati nella radice del dominio.
export default defineConfig({
  base: '/carovita/',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: true },
});
