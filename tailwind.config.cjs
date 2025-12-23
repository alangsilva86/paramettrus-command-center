module.exports = {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        param: {
          bg: '#121212',
          card: '#1A1A1A',
          border: 'rgba(255,255,255,0.08)',
          primary: '#0B7F16',
          accent: '#05400B',
          success: '#0B7F16',
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
