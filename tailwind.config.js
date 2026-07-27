/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#F5F3EF',
        ink: '#1C1B19',
        muted: '#8A8780',
        accent: '#2454FF',
        good: '#0F6E56',
        warn: '#854F0B',
        bad: '#993C1D',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
