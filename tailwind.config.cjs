module.exports = {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        param: {
          bg: '#0E0E11',
          card: '#15151A',
          border: 'rgba(255,255,255,0.08)',
          primary: '#FF6B06',
          accent: '#FF6B06',
          success: '#22C55E',
          warning: '#F59E0B',
          danger: '#B91C1C',
          text: 'rgba(255,255,255,0.92)'
        }
      },
      fontFamily: {
        sans: ['Inter', 'Roboto', 'sans-serif']
      }
    }
  },
  plugins: []
};
