import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F6F7F9',     // fondo de página
        ink: {
          DEFAULT: '#111827', // texto principal
          dim: '#5B6472',     // texto secundario
        },
        line: '#E1E4EA',
        // ── MARCA ─────────────────────────────────────────────────────────────
        // PROVISORIO: tonos neutros hasta tener la paleta oficial de Escalate Ops.
        // Cambiando estos 6 valores se rebrandea toda la página (botones, acentos,
        // retícula del fondo, foco de los campos y estados en vivo).
        brand: {
          50: '#EEF1F6',
          100: '#D9DFEA',
          400: '#6B7FA3',
          500: '#4A5F86',
          600: '#34476B',
          900: '#18213A',
        },
        // ──────────────────────────────────────────────────────────────────────
        pulse: '#FF6B5E',     // acento para estados en vivo y errores del log
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui'],
        display: ['var(--font-display)', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(17,24,39,0.04), 0 8px 24px -12px rgba(17,24,39,0.12)',
      },
    },
  },
  plugins: [],
};

export default config;
