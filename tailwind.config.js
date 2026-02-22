/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{js,jsx,ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // All surface + accent colors reference CSS variables so themes can swap them at runtime.
        // The `<alpha-value>` placeholder lets Tailwind opacity modifiers work (e.g. bg-surface-1/50).
        surface: {
          0: 'hsl(var(--surface-0) / <alpha-value>)',
          1: 'hsl(var(--surface-1) / <alpha-value>)',
          2: 'hsl(var(--surface-2) / <alpha-value>)',
          3: 'hsl(var(--surface-3) / <alpha-value>)',
          4: 'hsl(var(--surface-4) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          hover:   'hsl(var(--accent-hover) / <alpha-value>)',
          muted:   'hsl(var(--accent-muted) / <alpha-value>)',
        },
        muted: 'hsl(var(--muted) / <alpha-value>)',
        success: '#22c55e',
        warning: '#f59e0b',
        danger:  '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up':   'slideUp 0.3s ease-out',
        'fade-in':    'fadeIn 0.2s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%':   { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
