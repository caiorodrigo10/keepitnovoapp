/**
 * extract-fonts.mjs
 *
 * Story 1.3 — Baixa fontes Hanken Grotesk oficiais do Google Fonts CDN
 * e salva em packages/ui-tokens/fonts/*.woff2
 *
 * Contexto: o protótipo `keepit-app/index.html` (bundle v0/Lovable) empacota
 * apenas 1 peso da fonte (Regular 400) e o CSS declara todos os pesos apontando
 * pro mesmo arquivo. Isso quebraria a fidelidade visual — usaríamos Regular
 * em tudo. Solução: baixar os 5 pesos oficiais direto do Google Fonts CDN
 * (Hanken Grotesk é open source, SIL Open Font License).
 *
 * Uso:
 *   node packages/ui-tokens/scripts/extract-fonts.mjs
 *   (ou via: pnpm --filter @keepit/ui-tokens run extract-fonts)
 *
 * Sem dependências além de Node.js built-ins. Requer conexão à internet.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = resolve(__dirname, '../fonts');

// ---------------------------------------------------------------------------
// Weight name map (numeric weight → filename suffix)
// ---------------------------------------------------------------------------
const WEIGHT_MAP = {
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
};

// Google Fonts CSS API muda comportamento por User-Agent:
//   - Chrome moderno (v70+): retorna variable font (mesma URL para todos os pesos) — inútil pra nós.
//   - Chrome 60: retorna woff2 ESTÁTICO separado por peso — o que queremos.
// Documentado em https://developers.google.com/fonts/docs/getting_started (comportamento antigo mantido).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.113 Safari/537.36';

/**
 * Fetch Google Fonts CSS which contains @font-face blocks pointing to hosted woff2 URLs.
 */
async function fetchGoogleFontsCss() {
  const weights = Object.keys(WEIGHT_MAP).join(';');
  const url = `https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@${weights}&display=swap`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Google Fonts CSS request failed: ${res.status}`);
  return await res.text();
}

/**
 * Parse @font-face blocks and pick, per weight, the URL for the "latin" subset
 * (unicode-range U+0000-00FF etc.). Google Fonts CSS separates by subset;
 * comment /* latin *​/ precedes each latin block.
 */
function parseFontUrls(css) {
  const byWeight = new Map();
  // Split by /* latin */ comments — we only want the plain "latin" subset for MVP.
  // Regex captures blocks where the comment right before is /* latin */
  const re = /\/\*\s*latin\s*\*\/\s*@font-face\s*\{[^}]+font-weight:\s*(\d+);[^}]+src:\s*url\((https:\/\/[^)]+\.woff2)\)[^}]+\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const weight = parseInt(m[1], 10);
    const url = m[2];
    if (!byWeight.has(weight)) byWeight.set(weight, url);
  }
  return byWeight;
}

async function downloadBinary(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Download failed for ${url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

async function main() {
  console.log('=== extract-fonts.mjs — Story 1.3 ===');
  console.log('Source: Google Fonts CDN (Hanken Grotesk, latin subset)');
  console.log('Output:', FONTS_DIR);
  console.log('');

  const css = await fetchGoogleFontsCss();
  const byWeight = parseFontUrls(css);

  console.log(`Found ${byWeight.size} latin @font-face blocks from Google Fonts CSS.`);
  console.log('');

  mkdirSync(FONTS_DIR, { recursive: true });

  const extracted = [];
  const missing = [];

  for (const [weight, suffix] of Object.entries(WEIGHT_MAP)) {
    const w = parseInt(weight, 10);
    const url = byWeight.get(w);
    if (!url) {
      missing.push({ weight: w, suffix });
      console.warn(`  [WARN] ${suffix} (${w}) — not in CSS response, SKIPPED.`);
      continue;
    }
    const bytes = await downloadBinary(url);
    const outPath = resolve(FONTS_DIR, `HankenGrotesk-${suffix}.woff2`);
    writeFileSync(outPath, bytes);
    const kb = (bytes.length / 1024).toFixed(1);
    console.log(`  [OK]   HankenGrotesk-${suffix}.woff2  — ${kb} kB`);
    extracted.push({ suffix, weight: w, bytes: bytes.length });
  }

  console.log('');
  console.log(`Done. ${extracted.length} font(s) written, ${missing.length} missing.`);

  if (missing.length > 0) {
    console.warn('');
    console.warn('MISSING WEIGHTS:');
    missing.forEach(({ weight, suffix }) => console.warn(`  - ${suffix} (weight ${weight})`));
    process.exit(1);
  }

  // Sanity check: are the files truly distinct?
  const { readFileSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const hashes = new Set();
  for (const { suffix } of extracted) {
    const p = resolve(FONTS_DIR, `HankenGrotesk-${suffix}.woff2`);
    const h = createHash('md5').update(readFileSync(p)).digest('hex');
    hashes.add(h);
  }
  console.log('');
  console.log(`Distinct file hashes: ${hashes.size} of ${extracted.length}`);
  if (hashes.size !== extracted.length) {
    console.error('FATAL: Duplicated files detected — weights should have distinct bytes.');
    process.exit(1);
  }
  console.log('All font weights are byte-distinct. ✓');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
