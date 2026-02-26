/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* ═══════════════════════════════════════════════
           KOSMOS 2026 CI — Strict 3-Color System
           Purple: #2E1A6E  |  Mint: #81C7A9  |  Yellow: #EDE556
           ═══════════════════════════════════════════════ */
        indigo: {
          50: '#F0EEF7',   // Lightest purple tint (subtle bg)
          100: '#DDD8EC',   // Light purple (hover states)
          200: '#B8AED4',   // Soft purple (borders)
          300: '#8A7CB8',   // Medium-light purple
          400: '#5C4A9C',   // Medium purple (readable text)
          500: '#3D2A82',   // Primary purple (text, links)
          600: '#2E1A6E',   // KOSMOS PURPLE (buttons, headings)
          700: '#261558',   // Dark purple (hover)
          800: '#1E1048',   // Darker purple
          900: '#160B38',   // Darkest purple (headers)
        },
        slate: {
          /* Text colors → all purple-tinted for CI consistency */
          50: '#F5F3FA',   // Near-white with purple tint
          100: '#EBE8F3',   // Very light purple bg
          200: '#D5D0E3',   // Light purple borders
          300: '#B8B0CE',   // Muted purple borders
          400: '#6B5E8A',   // Muted purple text (readable)
          500: '#4A3D6E',   // Body text (dark purple)
          600: '#3A2E58',   // Strong body text
          700: '#2E1A6E',   // === KOSMOS PURPLE (emphasis)
          800: '#231452',   // Heading text
          900: '#160B38',   // Near-black purple
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
