#!/usr/bin/env node
// Regenerates every shipped PWA/favicon raster from the SVG masters in design/.
// Usage: npm run icons  (design/*.svg are the single source of truth — edit those, not the PNGs).
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFileSync(resolve(root, 'design', name), 'utf8');
const out = (...parts) => {
  const file = resolve(root, ...parts);
  mkdirSync(dirname(file), { recursive: true });
  return file;
};
const render = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
const write = (file, data, label) => {
  writeFileSync(file, data);
  console.log(`  ${label.padEnd(34)} ${String(data.length).padStart(7)} bytes`);
};

// Standard ICO container holding PNG payloads (Windows Vista+, and every modern browser).
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...images.map(image => image.png)]);
}

const master = read('icon.svg');
const maskable = read('icon-maskable.svg');
const small = read('icon-small.svg');

// The SVGs are also shipped as-is: browsers without a favicon.ico pick the crisp vector.
write(out('public', 'icon.svg'), Buffer.from(master), 'public/icon.svg');
write(out('public', 'icon-maskable.svg'), Buffer.from(maskable), 'public/icon-maskable.svg');

console.log('\nApp icons (rounded, purpose "any"):');
for (const size of [96, 144, 192, 256, 384, 512, 1024]) {
  write(out('public', 'icons', `icon-${size}.png`), render(master, size), `public/icons/icon-${size}.png`);
}

console.log('\nMaskable + iOS icons (full bleed, safe-zone artwork):');
for (const size of [192, 512]) {
  write(out('public', 'icons', `icon-maskable-${size}.png`), render(maskable, size), `public/icons/icon-maskable-${size}.png`);
}
// iOS ignores transparency and applies its own mask, so it gets the full-bleed variant.
write(out('public', 'icons', 'apple-touch-icon.png'), render(maskable, 180), 'public/icons/apple-touch-icon.png');

console.log('\nFavicons (simplified mark):');
const faviconSizes = [16, 32, 48];
const faviconPngs = faviconSizes.map(size => ({ size, png: render(small, size) }));
for (const { size, png } of faviconPngs) write(out('public', `favicon-${size}.png`), png, `public/favicon-${size}.png`);
write(out('public', 'favicon.ico'), ico(faviconPngs), 'public/favicon.ico');

// Keep the Vite dev server honest: index.html references these paths directly.
copyFileSync(out('public', 'icons', 'icon-192.png'), out('public', 'icons', 'icon-192.png'));
console.log('\nDone. Rasters are generated from design/*.svg — never edit them by hand.');
