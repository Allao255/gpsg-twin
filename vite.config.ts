import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Dois builds:
//   padrão  -> dist/site/ (GitHub Pages, caminhos relativos)
//   single  -> dist/gpsg-twin.html (autocontido, abre por file:// sem rede)
export default defineConfig(({ mode }) => {
  if (mode === 'single') {
    return {
      base: './',
      plugins: [viteSingleFile()],
      build: {
        outDir: 'dist/single',
        emptyOutDir: true,
        rollupOptions: { input: 'index.html' },
      },
    };
  }
  return {
    base: './',
    build: { outDir: 'dist/site', emptyOutDir: true },
  };
});
