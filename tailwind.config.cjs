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
          bg: '#0E0E11',
          card: '#1C1C21',
          border: '#333333',
          primary: '#FF6B06',
          accent: '#5A4BE3',
          success: '#00C853',
          danger: '#FF1744',
          text: '#F7F7F7'
        }
      },
      fontFamily: {
        sans: ['Inter', 'Roboto', 'sans-serif']
      }
    }
  },
  plugins: []
};
