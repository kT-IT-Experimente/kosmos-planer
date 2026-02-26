/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Kosmos 2026 CI — Override Tailwind Defaults */
        indigo: {
          50: '#E8F5EE',   // Lightest Mint (tags, highlights)
          100: '#D0EBDD',   // Light Mint (hover backgrounds)
          200: '#B8E0CE',   // Soft Mint
          300: '#81C7A9',   // Mint Green
          400: '#6BB895',   // Darker Mint
          500: '#81C7A9',   // Primary Mint Green
          600: '#351E8B',   // Deep Purple (primary buttons)
          700: '#2D1877',   // Dark Purple (button hover)
          800: '#241363',   // Darker Purple
          900: '#1C0F4F',   // Darkest Purple (headers)
        },
        slate: {
          50: '#F8FAF9',   // Very Light Mint-tinted White
          100: '#F1F5F0',   // Light Background (cards, stats)
          200: '#E2E8E4',   // Borders
          300: '#CBD5CE',   // Muted borders
          400: '#94A39A',   // Muted text
          500: '#64746B',   // Secondary text
          600: '#475550',   // Body text
          700: '#334139',   // Strong text
          800: '#1E2D24',   // Dark text
          900: '#161616',   // Black
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

