/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/**/*.{html,js,ts,jsx,tsx,css}'],
  theme: {
    extend: {
      colors: {
        'tokyo-night': {
          DEFAULT: '#1a1b26',
          line: '#1f2335',
          selection: '#33467c',
          foreground: '#c0caf5',
          comment: '#565f89',
          pink: '#f7768e',
          orange: '#ff9e64',
          yellow: '#e0af68',
          green: '#9ece6a',
          cyan: '#7dcfff',
          blue: '#7aa2f7',
          purple: '#bb9af7'
        }
      }
    },
  },
  plugins: [],
}
