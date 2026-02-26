/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* ═══════════════════════════════════════════════════════════
           KOSMOS 2026 CI — Strict 3-Color System
           Purple: #2E1A6E  |  Mint: #81C7A9  |  Yellow: #EDE556
           
           ALL Tailwind palettes remapped to these 3 colors.
           This is the SINGLE SOURCE OF TRUTH for the entire app.
           ═══════════════════════════════════════════════════════════ */

        /* ── INDIGO → Purple Palette (primary UI) ── */
        indigo: {
          50: '#F0EEF7',
          100: '#DDD8EC',
          200: '#B8AED4',
          300: '#8A7CB8',
          400: '#5C4A9C',
          500: '#3D2A82',
          600: '#2E1A6E',   // ★ KOSMOS PURPLE
          700: '#261558',
          800: '#1E1048',
          900: '#160B38',
        },

        /* ── SLATE → Purple-tinted neutrals (text, borders) ── */
        slate: {
          50: '#F5F3FA',
          100: '#EBE8F3',
          200: '#D5D0E3',
          300: '#B8B0CE',
          400: '#6B5E8A',
          500: '#4A3D6E',
          600: '#3A2E58',
          700: '#2E1A6E',   // ★ same as Kosmos Purple
          800: '#231452',
          900: '#160B38',
        },

        /* ── GRAY → Purple-tinted grays (Admin sections, etc.) ── */
        gray: {
          50: '#F5F3FA',
          100: '#EBE8F3',
          200: '#D5D0E3',
          300: '#B8B0CE',
          400: '#6B5E8A',
          500: '#4A3D6E',
          600: '#3A2E58',
          700: '#2E1A6E',
          800: '#231452',
          900: '#160B38',
        },

        /* ── BLUE → Purple shades (Talk/Vortrag tags) ── */
        blue: {
          50: '#F0EEF7',
          100: '#DDD8EC',
          200: '#B8AED4',
          300: '#8A7CB8',
          400: '#5C4A9C',
          500: '#3D2A82',
          600: '#2E1A6E',
          700: '#261558',
          800: '#1E1048',
          900: '#160B38',
        },

        /* ── PURPLE → Same as Indigo (Panel tags) ── */
        purple: {
          50: '#F0EEF7',
          100: '#DDD8EC',
          200: '#B8AED4',
          300: '#8A7CB8',
          400: '#5C4A9C',
          500: '#3D2A82',
          600: '#2E1A6E',
          700: '#261558',
          800: '#1E1048',
          900: '#160B38',
        },

        /* ── ORANGE → Purple (Production header, Workshop tags, Save button) ── */
        orange: {
          50: '#F0EEF7',
          100: '#DDD8EC',
          200: '#B8AED4',
          300: '#8A7CB8',
          400: '#5C4A9C',
          500: '#3D2A82',
          600: '#2E1A6E',
          700: '#261558',
          800: '#1E1048',
          900: '#160B38',
        },

        /* ── GREEN → Mint Green shades (success, confirmed) ── */
        green: {
          50: '#E8F5EE',
          100: '#D0EBDD',
          200: '#B8E0CE',
          300: '#81C7A9',   // ★ KOSMOS MINT
          400: '#6BB895',
          500: '#55A882',
          600: '#3D8A67',
          700: '#2D6E4F',
          800: '#1E5238',
          900: '#0F3621',
        },

        /* ── EMERALD → Mint Green (Admin save buttons) ── */
        emerald: {
          50: '#E8F5EE',
          100: '#D0EBDD',
          200: '#B8E0CE',
          300: '#81C7A9',
          400: '#6BB895',
          500: '#55A882',
          600: '#3D8A67',
          700: '#2D6E4F',
          800: '#1E5238',
          900: '#0F3621',
        },

        /* ── TEAL → Mint Green ── */
        teal: {
          50: '#E8F5EE',
          100: '#D0EBDD',
          200: '#B8E0CE',
          300: '#81C7A9',
          400: '#6BB895',
          500: '#55A882',
          600: '#3D8A67',
          700: '#2D6E4F',
          800: '#1E5238',
          900: '#0F3621',
        },

        /* ── CYAN → Mint Green (Lightning Talk tags) ── */
        cyan: {
          50: '#E8F5EE',
          100: '#D0EBDD',
          200: '#B8E0CE',
          300: '#81C7A9',
          400: '#6BB895',
          500: '#55A882',
          600: '#3D8A67',
          700: '#2D6E4F',
          800: '#1E5238',
          900: '#0F3621',
        },

        /* ── YELLOW → Kosmos Yellow (accent, status) ── */
        yellow: {
          50: '#FEFCE8',
          100: '#FDF7C3',
          200: '#FCEF8E',
          300: '#EDE556',   // ★ KOSMOS YELLOW
          400: '#E0D640',
          500: '#C4B82A',
          600: '#9A9020',
          700: '#716818',
          800: '#4A4410',
          900: '#2A2608',
        },

        /* ── AMBER → Yellow tones (star ratings) ── */
        amber: {
          50: '#FEFCE8',
          100: '#FDF7C3',
          200: '#FCEF8E',
          300: '#EDE556',
          400: '#E0D640',
          500: '#C4B82A',
          600: '#9A9020',
          700: '#716818',
          800: '#4A4410',
          900: '#2A2608',
        },

        /* ── RED → Keep distinctive but CI-adjacent (alerts, live) ── */
        red: {
          50: '#FEF2F2',
          100: '#FEE2E2',
          200: '#FECACA',
          300: '#FCA5A5',
          400: '#F87171',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
          800: '#991B1B',
          900: '#7F1D1D',
        },

        /* ── PINK → Purple-tinted (Keynote tags) ── */
        pink: {
          50: '#F0EEF7',
          100: '#DDD8EC',
          200: '#B8AED4',
          300: '#8A7CB8',
          400: '#5C4A9C',
          500: '#3D2A82',
          600: '#2E1A6E',
          700: '#261558',
          800: '#1E1048',
          900: '#160B38',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
