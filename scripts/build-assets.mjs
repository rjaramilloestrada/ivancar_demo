#!/usr/bin/env node
/**
 * Genera los assets optimizados del demo a partir de los originales de ivancar-ec.com.
 *
 *   npm run assets
 *
 * Originales: se descargan a `assets-src/` (ignorada por git) si no existen.
 * Salidas (versionadas):
 *   public/img/hero-1200.webp, hero-640.webp      foto hero (original 6016 px)
 *   public/img/corporativo-1200.webp
 *   public/img/conductores-800.webp
 *   public/img/ivancarlogo-220.webp, -440.webp     logo liviano para UI (srcSet 1x/2x)
 *   public/icons/icon-192.png, icon-512.png        ícono PWA "any"
 *   public/icons/maskable-512.png                  ícono PWA "maskable"
 *   public/icons/apple-touch-icon-180.png          iOS
 *   public/icons/favicon-48.png                    favicon
 *
 * Nota sobre el ícono: `icono.png` de su web es en realidad un .ico de 60×53 px.
 * Escalarlo a 512 px queda borroso, así que los íconos PWA se dibujan como vector
 * replicando ese mismo favicon (bloque amarillo con borde negro e "IC" en itálica
 * extra bold). El original se conserva en public/img/icono.png como referencia.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'assets-src');
const IMG = join(root, 'public/img');
const ICONS = join(root, 'public/icons');
const ORIGIN = 'https://ivancar-ec.com/assets/img/';

const YELLOW = '#F6C90E';
const BLACK = '#050505';

for (const d of [SRC, IMG, ICONS]) mkdirSync(d, { recursive: true });

async function ensureSource(name) {
  const file = join(SRC, name);
  if (existsSync(file)) return file;
  console.log(`· descargando ${name}`);
  try {
    const res = await fetch(ORIGIN + name);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  } catch (err) {
    console.error(
      `No se pudo descargar ${name} (${err.message}). Descárgalo a mano:\n  curl -o assets-src/${name} ${ORIGIN}${name}`,
    );
    process.exit(1);
  }
  return file;
}

async function webp(srcName, outName, width, quality = 78) {
  const src = await ensureSource(srcName);
  const info = await sharp(src)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: 6 })
    .toFile(join(IMG, outName));
  console.log(`✓ img/${outName} ${info.width}×${info.height} ${(info.size / 1024).toFixed(0)} KB`);
}

/**
 * Marca "IC" en vector (viewBox 512). `inset` reduce la marca hacia el centro
 * (para la zona segura de los íconos maskable).
 */
function markSvg({ size = 512, tile = 'outlined', scale = 1 } = {}) {
  const glyphs = `
    <g transform="translate(256 256) scale(${scale}) skewX(-13) translate(-256 -256)" fill="${BLACK}">
      <rect x="86" y="128" width="80" height="256" />
      <path d="M420.9 182.6 A128 128 0 1 0 420.9 329.4 L366.8 291.6 A62 62 0 1 1 366.8 220.4 Z" />
    </g>`;
  const bg =
    tile === 'outlined'
      ? `<rect x="14" y="40" width="484" height="432" rx="92" fill="${YELLOW}" stroke="${BLACK}" stroke-width="22" />`
      : `<rect width="512" height="512" fill="${YELLOW}" />`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">${bg}${glyphs}</svg>`,
  );
}

async function icon(outName, size, opts) {
  const info = await sharp(markSvg({ size: 512, ...opts }), { density: Math.max(72, (72 * size) / 512) * 2 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(ICONS, outName));
  console.log(`✓ icons/${outName} ${info.width}×${info.height}`);
}

await webp('hero-foto.jpg', 'hero-1200.webp', 1200, 76);
await webp('hero-foto.jpg', 'hero-640.webp', 640, 74);
await webp('corporativo.jpg', 'corporativo-1200.webp', 1200, 76);
await webp('conductores.png', 'conductores-800.webp', 800, 80);

{
  const src = await ensureSource('ivancarlogo.png');
  for (const w of [220, 440]) {
    const info = await sharp(src).resize({ width: w }).webp({ quality: 90, alphaQuality: 100 }).toFile(join(IMG, `ivancarlogo-${w}.webp`));
    console.log(`✓ img/ivancarlogo-${w}.webp ${info.width}×${info.height} ${(info.size / 1024).toFixed(0)} KB`);
  }
}

await icon('icon-192.png', 192, { tile: 'outlined' });
await icon('icon-512.png', 512, { tile: 'outlined' });
await icon('maskable-512.png', 512, { tile: 'full', scale: 0.72 });
await icon('apple-touch-icon-180.png', 180, { tile: 'full', scale: 0.82 });
await icon('favicon-48.png', 48, { tile: 'outlined' });
writeFileSync(join(ICONS, 'mark.svg'), markSvg({ tile: 'outlined' }));
console.log('✓ icons/mark.svg');
