/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@keepit/ui-tokens/tailwind')],
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Override local do preset compartilhado: `next/font/local` (layout.tsx)
      // registra `@font-face { font-family: hanken }` e expõe a CSS var
      // `--font-hanken` (via `hanken.variable` no <html>), mas o preset
      // (`packages/ui-tokens/src/tailwind.js`) usa o nome literal
      // "Hanken Grotesk" em `fontFamily.sans`, que não casa com nenhum
      // `@font-face` gerado — o body caía para system-ui (QA gate FAIL,
      // REQ-001). Fix: apontar `fontFamily.sans` para a CSS var real,
      // aqui — apenas no Admin — sem tocar o preset compartilhado (que
      // também serve como fonte de verdade documental para o mobile).
      fontFamily: {
        sans: ['var(--font-hanken)', 'system-ui', 'sans-serif'],
      },
    },
  },
};
