module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    './src/styles/**/*.css'
  ],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--pm-bg) / <alpha-value>)',
        surface: 'rgb(var(--pm-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--pm-surface-2) / <alpha-value>)',
        text: 'rgb(var(--pm-text) / <alpha-value>)',
        muted: 'rgb(var(--pm-muted) / <alpha-value>)',
        border: 'rgb(var(--pm-border) / <alpha-value>)',
        primary: 'rgb(var(--pm-primary) / <alpha-value>)',
        'primary-pressed': 'rgb(var(--pm-primary-pressed) / <alpha-value>)',
        ring: 'rgb(var(--pm-ring) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        focus: 'rgb(var(--focus-ring) / <alpha-value>)',
        param: {
          bg: 'rgb(var(--pm-bg) / <alpha-value>)',
          card: 'rgb(var(--pm-surface) / <alpha-value>)',
          'surface-2': 'rgb(var(--pm-surface-2) / <alpha-value>)',
          border: 'rgb(var(--pm-border) / <alpha-value>)',
          primary: 'rgb(var(--pm-primary) / <alpha-value>)',
          'primary-press': 'rgb(var(--pm-primary-pressed) / <alpha-value>)',
          text: 'rgb(var(--pm-text) / <alpha-value>)',
          muted: 'rgb(var(--pm-muted) / <alpha-value>)',
          danger: 'rgb(var(--danger) / <alpha-value>)',
          success: 'rgb(var(--success) / <alpha-value>)',
          warning: 'rgb(var(--warning) / <alpha-value>)'
        }
      },
      borderRadius: {
        pm: 'var(--pm-radius)'
      },
      boxShadow: {
        pm: 'var(--pm-shadow)'
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'Apple Color Emoji',
          'Segoe UI Emoji'
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'Liberation Mono',
          'Courier New',
          'monospace'
        ]
      }
    }
  },
  plugins: []
};
