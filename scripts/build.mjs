import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import esbuild from 'esbuild';

const handlers = ['onOpen', 'syncNow', 'dryRun', 'installHourlyTrigger', 'removeSyncTriggers'];

/**
 * Apps Script registers simple triggers by finding `function onOpen()` in
 * the source. The bundle is an IIFE, so these wrappers sit outside it and
 * forward to the registry the bundle publishes on globalThis.
 */
const footer = handlers
  .map(
    (name) =>
      `function ${name}() {\n  return globalThis.__sheetsCalendarSync.${name}();\n}`,
  )
  .join('\n');

mkdirSync('dist', { recursive: true });

await esbuild.build({
  entryPoints: ['src/gas/entry.ts'],
  bundle: true,
  outfile: 'dist/Code.js',
  format: 'iife',
  target: 'es2020',
  platform: 'browser',
  legalComments: 'none',
  // Minify the Luxon bundle. Property names stay intact, and the footer
  // below is appended as text so `function onOpen()` is still visible to Apps Script.
  minify: true,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  banner: {
    js: '/* Generated from src/ by npm run build. Edit the TypeScript, then rebuild. */',
  },
  footer: { js: footer },
});

copyFileSync('appsscript.json', 'dist/appsscript.json');

const code = readFileSync('dist/Code.js', 'utf8');
for (const name of handlers) {
  if (!code.includes(`function ${name}()`)) {
    throw new Error(`Bundle is missing the global function ${name}.`);
  }
}
if (!code.includes('__sheetsCalendarSync')) {
  throw new Error('Bundle does not publish the handler registry.');
}

const loaded = spawnSync(process.execPath, ['dist/Code.js'], { encoding: 'utf8' });
if (loaded.status !== 0) {
  throw new Error(`Bundle failed to load.\n${loaded.stderr || loaded.stdout}`);
}

console.log('Built dist/Code.js and dist/appsscript.json');
