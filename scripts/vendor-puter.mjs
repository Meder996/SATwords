#!/usr/bin/env node
// Copies the official Puter.js browser build out of node_modules into public/vendor/
// so the app loads the SDK from its own origin instead of the js.puter.com CDN.
// Usage: npm run vendor:puter
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'node_modules/@heyputer/puter.js/dist/puter.cjs');
const target = resolve(root, 'public/vendor/puter.js');
const pkg = resolve(root, 'node_modules/@heyputer/puter.js/package.json');

if (!existsSync(source)) {
  if (existsSync(target)) {
    console.warn('Puter.js is not installed; keeping the existing public/vendor/puter.js copy.');
    process.exit(0);
  }
  console.error('Puter.js is not installed and public/vendor/puter.js is missing. Run `npm install` first.');
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(pkg, 'utf8'));
const banner = `/*! Puter.js v${version} — https://js.puter.com/v2/ (self-hosted copy)\n * Copyright 2024-present Puter Technologies Inc. Licensed under Apache-2.0.\n * Regenerate with: npm run vendor:puter\n */\n`;
const bundle = readFileSync(source, 'utf8');
const header = `// Puter.js v${version} (official browser build, self-hosted). Apache-2.0 — see public/vendor/README.md.\n`;

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, header + banner + bundle);

console.log(`Vendored Puter.js v${version} → public/vendor/puter.js (${(Buffer.byteLength(bundle) / 1024).toFixed(0)} KB)`);
