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
        background: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        border: 'var(--border)',
        primary: 'var(--primary)',
        'primary-press': 'var(--primary-press)',
        danger: 'var(--danger)',
        success: 'var(--success)',
        warning: 'var(--warning)'
      },
      spacing: {
        px: '1px',
        2: '8px',
        4: '16px',
        6: '24px',
        8: '32px',
        10: '40px',
        12: '48px',
        14: '56px',
        16: '64px',
        20: '80px'
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)'
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)'
      },
      fontSize: {
        base: ['16px', '1.5'],
        'title-xl': ['20px', '1.4'],
        'title-lg': ['18px', '1.4'],
        'title-md': ['16px', '1.4'],
        'title-sm': ['14px', '1.4']
      },
      ringOffsetWidth: {
        2: '2px'
      }
    }
  },
  plugins: []
};
