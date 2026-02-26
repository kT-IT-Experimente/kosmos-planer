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
          50: '#E8F5EE',   // Lightest Mint (tag backgrounds)
          100: '#D0EBDD',   // Light Mint (hover states)
          200: '#B8E0CE',   // Soft Mint (borders, subtle bg)
          300: '#81C7A9',   // Mint Green (accents)
          400: '#5A4BAF',   // Medium Purple (readable text on white)
          500: '#4A3D9F',   // Medium-Dark Purple (text, links)
          600: '#351E8B',   // Deep Purple (buttons — white text)
          700: '#2D1877',   // Dark Purple (button hover)
          800: '#241363',   // Darker Purple (panels)
          900: '#1C0F4F',   // Darkest Purple (headers)
        },
        slate: {
          50: '#F8FAF9',   // Near-White (page background)
          100: '#F1F5F0',   // Very Light (cards, stat boxes)
          200: '#E2E8E4',   // Light Borders
          300: '#CBD5CE',   // Medium Borders
          400: '#6B7D73',   // Darker Muted text (WCAG AA on white)
          500: '#4A5B52',   // Body text (good contrast)
          600: '#38483F',   // Strong body text
          700: '#2A3830',   // Emphasis text
          800: '#1E2D24',   // Heading text
          900: '#161616',   // Black (maximum contrast)
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
