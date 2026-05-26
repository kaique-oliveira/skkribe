/** @type {import('tailwindcss').Config} */
// Tokens mirror /mac/Skribe/Skribe/Theme/Theme.swift — keep in sync when either side moves.
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Page bg — white in the Swift app post-redesign.
        bg: '#FFFFFF',
        // Nested gray block (data emphasis inside a "card"). Layer 2 in the system.
        nested: '#F0F1F3',
        // Subtler secondary surface (hover targets, sidebars).
        subtle: '#F8F9FA',
        hover: '#EBEDEF',
        // Text levels (never pure black — feels harsh on a near-white bg).
        ink: { 1: '#2A2A2C', 2: '#6B6B70', 3: '#A8A8AD' },
        // Recording-red accent palette.
        accent: {
          DEFAULT: '#DC2626',
          hover: '#B91C1C',
          light: '#FEE2E2',
          'soft-text': '#991B1B',
        },
        // Semantic status palette — 3 layers each: fill / pill bg / pill text.
        positive: { fill: '#22C55E', pill: '#DCFCE7', text: '#15803D' },
        warning:  { fill: '#F59E0B', pill: '#FEF3C7', text: '#A16207' },
        info:     { fill: '#3B82F6', pill: '#DBEAFE', text: '#1D4ED8' },
        secondary: { fill: '#EC4899', pill: '#FCE7F3', text: '#9D174D' },
      },
      borderRadius: {
        // Pills are .rounded-full; rest below.
        card: '20px',
        'card-sm': '16px',
        nested: '14px',
        chip: '8px',
        input: '12px',
      },
      boxShadow: {
        // Soft 2-layer shadow used on all elevated chrome (FAB, hover).
        card: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
        elevated: '0 4px 12px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04)',
        floating: '0 8px 24px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.05)',
      },
      fontFamily: {
        // Skribe uses the system stack. Bold weights come from -apple-system on Mac
        // and Segoe UI on Win. Falls back to a generic stack on Linux.
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'Segoe UI',
          'Helvetica Neue', 'Arial', 'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
