/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F8FAFC',
        ink: '#0F172A',
        muted: '#475569',
        border: '#E5E7EB',
        accent: '#355CDE',
        'accent-hover': '#2F52C8',
        'accent-soft': '#EEF2FF',
        good: '#16A34A',
        warn: '#D97706',
        bad: '#DC2626',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-sora)', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 6px rgba(15, 23, 42, 0.04)',
        elevated: '0 4px 16px rgba(15, 23, 42, 0.08)',
      },
    },
  },
  plugins: [],
};
