/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
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

        'dark-bg': '#0B1220',
        'dark-surface': '#111827',
        'dark-surface-elevated': '#172033',
        'dark-border': '#243041',
        'dark-text': '#F8FAFC',
        'dark-text-secondary': '#94A3B8',
        'dark-accent': '#6C8CFF',
        'dark-accent-hover': '#5D7EF5',
        'dark-accent-soft': 'rgba(108,140,255,0.14)',
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
      keyframes: {
        flotar: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-7px)' },
        },
        // Flotación sutil para íconos chicos (miniaturas): se eleva un poco y
        // hace un bob leve. Incluye el scale adentro para que no pelee con un
        // hover:scale por separado (la animación pisa el transform).
        flotarLeve: {
          '0%, 100%': { transform: 'translateY(0) scale(1.08)' },
          '50%': { transform: 'translateY(-3px) scale(1.08)' },
        },
        // Vaivén lateral para el hover de las tarjetas de accesorios: un
        // balanceo de lado a lado que llama la atención sin tapar la imagen.
        vaivenLateral: {
          '0%, 100%': { transform: 'translateX(0) rotate(0deg)' },
          '25%': { transform: 'translateX(-5px) rotate(-4deg)' },
          '75%': { transform: 'translateX(5px) rotate(4deg)' },
        },
      },
      animation: {
        flotar: 'flotar 3.2s ease-in-out infinite',
        flotarLeve: 'flotarLeve 2.2s ease-in-out infinite',
        vaivenLateral: 'vaivenLateral 0.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
