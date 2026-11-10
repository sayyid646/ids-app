/** Warna identitas IDS: ice blue, putih, champagne gold, midnight navy, hitam lembut. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#0A1422', 900: '#0F1E33', 800: '#16304F', 700: '#21416A', 600: '#335780' },
        ice: { 50: '#F5F9FC', 100: '#EAF2F8', 200: '#D7E6F2', 300: '#B9D2E6', 400: '#8FB4D2' },
        gold: { 50: '#FBF7EF', 100: '#F3E8D2', 200: '#E8D3A9', 300: '#D9BC85', 400: '#C9A96E', 500: '#AE8C4F', 600: '#8A6C36', 700: '#6B5228' },
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
