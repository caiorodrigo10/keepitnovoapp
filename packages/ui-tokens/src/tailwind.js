// @ts-check
const tokens = require('./tokens.json');

/**
 * Flatten a nested color object into Tailwind-compatible flat keys.
 * e.g. { bg: { primary: "#fff" } } → { "bg-primary": "#fff" }
 * @param {Record<string, Record<string, string>>} theme
 * @returns {Record<string, string>}
 */
function flattenColors(theme) {
  /** @type {Record<string, string>} */
  const flat = {};
  for (const [group, values] of Object.entries(theme)) {
    for (const [name, value] of Object.entries(values)) {
      flat[`${group}-${name}`] = value;
    }
  }
  return flat;
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        // Admin usa tema dark como base
        ...flattenColors(tokens.colors.dark),
        // Expose light theme under "light-" prefix when needed
        ...Object.fromEntries(
          Object.entries(flattenColors(tokens.colors.light)).map(([k, v]) => [
            `light-${k}`,
            v,
          ])
        ),
      },
      fontFamily: {
        sans: [tokens.typography.fontFamily, 'system-ui', 'sans-serif'],
      },
      fontSize: Object.fromEntries(
        Object.entries(tokens.typography.sizes).map(([k, v]) => [
          k,
          [`${v.fontSize}px`, `${v.lineHeight}px`],
        ])
      ),
      fontWeight: Object.fromEntries(
        Object.entries(tokens.typography.weights).map(([k, v]) => [k, String(v)])
      ),
      letterSpacing: Object.fromEntries(
        Object.entries(tokens.typography.letterSpacing).map(([k, v]) => [
          k,
          `${v}em`,
        ])
      ),
      spacing: Object.fromEntries(
        Object.entries(tokens.spacing).map(([k, v]) => [k, `${v}px`])
      ),
      borderRadius: Object.fromEntries(
        Object.entries(tokens.radii).map(([k, v]) => [
          k,
          v === 9999 ? '9999px' : `${v}px`,
        ])
      ),
      boxShadow: tokens.shadows,
    },
  },
};
