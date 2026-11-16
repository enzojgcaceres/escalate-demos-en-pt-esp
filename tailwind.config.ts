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
        // 600 = azul oficial de Escalate Ops (#3C486B, fondo del isotipo y del banner).
        // El resto son tonos derivados para hover, fondos y foco: PROVISORIOS hasta
        // tener una paleta oficial completa. Cambiando estos 6 valores se rebrandea
        // toda la página (botones, acentos, retícula, foco de campos, estados en vivo).
        brand: {
          50: '#EEF0F5',
          100: '#D8DCE7',
          400: '#6F7BA0',
          500: '#4E5B82',
          600: '#3C486B',
          900: '#1E2438',
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
