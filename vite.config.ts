import { defineConfig } from 'vite';
import { resolve, join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';

function getArtworkEntries(): Record<string, string> {
  const rootDir = process.cwd();
  const artworksDir = resolve(rootDir, 'artworks');
  const entries: Record<string, string> = {
    main: resolve(rootDir, 'index.html'),
  };

  if (existsSync(artworksDir)) {
    const items = readdirSync(artworksDir, { withFileTypes: true });
    for (const item of items) {
      if (item.isDirectory()) {
        const entryHtml = join(artworksDir, item.name, 'index.html');
        if (existsSync(entryHtml)) {
          entries[`artworks/${item.name}/index`] = entryHtml;
        }
      }
    }
  }

  return entries;
}

export default defineConfig({
  assetsInclude: ['**/*.glb', '**/*.gltf'],
  build: {
    rollupOptions: {
      input: getArtworkEntries(),
    },
  },
});
