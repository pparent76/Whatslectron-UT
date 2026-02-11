const esbuild = require('esbuild');
const path = require('path');

// Récupère l'architecture cible depuis la variable d'environnement
const arch = process.env.ESBUILD_ARCH || process.arch;

(async () => {
  try {
    console.log(`[esbuild] Bundling main process for arch: ${arch}`);

    // Bundle main.js
    await esbuild.build({
      entryPoints: [path.resolve(__dirname, '../main.js')],
      bundle: true,
      platform: 'node',            // Electron main process
      outfile: path.resolve(__dirname, '../dist/main.js'),
      external: ['electron', 'fs', 'path'], // Modules natifs
      define: { 'process.env.NODE_ENV': '"production"' },
      sourcemap: true,
      minify: false,
      target: ['node18'],          // Node correspondant à Electron 26+
      logLevel: 'info',
    });

    console.log('[esbuild] main.js bundled successfully');

    // Optionnel : bundle preload.js
    await esbuild.build({
      entryPoints: [path.resolve(__dirname, '../preload.js')],
      bundle: true,
      platform: 'browser',         // preload est côté page
      outfile: path.resolve(__dirname, '../dist/preload.js'),
      sourcemap: true,
      minify: false,
      logLevel: 'info',
    });

    console.log('[esbuild] preload.js bundled successfully');

  } catch (err) {
    console.error('[esbuild] Build failed', err);
    process.exit(1);
  }
})();
