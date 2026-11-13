/** Warna identitas IDS: ice blue, putih, champagne gold, midnight navy, hitam lembut. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: 'rgb(var(--navy-950) / <alpha-value>)', 900: 'rgb(var(--navy-900) / <alpha-value>)', 800: 'rgb(var(--navy-800) / <alpha-value>)', 700: 'rgb(var(--navy-700) / <alpha-value>)', 600: 'rgb(var(--navy-600) / <alpha-value>)' },
        ice: { 50: 'rgb(var(--ice-50) / <alpha-value>)', 100: 'rgb(var(--ice-100) / <alpha-value>)', 200: 'rgb(var(--ice-200) / <alpha-value>)', 300: 'rgb(var(--ice-300) / <alpha-value>)', 400: 'rgb(var(--ice-400) / <alpha-value>)' },
        gold: { 50: 'rgb(var(--gold-50) / <alpha-value>)', 100: 'rgb(var(--gold-100) / <alpha-value>)', 200: 'rgb(var(--gold-200) / <alpha-value>)', 300: 'rgb(var(--gold-300) / <alpha-value>)', 400: 'rgb(var(--gold-400) / <alpha-value>)', 500: 'rgb(var(--gold-500) / <alpha-value>)', 600: 'rgb(var(--gold-600) / <alpha-value>)', 700: 'rgb(var(--gold-700) / <alpha-value>)' },
        ink: { DEFAULT: '#14171C', soft: '#4A5361', muted: '#7A8494' },
        ok: { 50: '#ECF7F1', 600: '#2F7D55', 700: '#22603F' },
        bad: { 50: '#FBEDEC', 600: '#B03A2E', 700: '#8E2C22' },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,30,51,.04), 0 4px 16px rgba(15,30,51,.05)',
        pop: '0 12px 40px rgba(10,20,34,.18)',
      },
      borderRadius: { xl2: '1.125rem' },
    },
  },
  plugins: [],
}
