import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const allowedHosts = [
      env.VITE_PREVIEW_ALLOWED_HOSTS,
      env.RAILWAY_PUBLIC_DOMAIN,
      env.RAILWAY_STATIC_URL,
      'paramettrus-frontend-production.up.railway.app'
    ]
      .filter(Boolean)
      .flatMap((value) => value.split(',').map((host) => host.trim()))
      .filter(Boolean);

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
            changeOrigin: true
          }
        }
      },
      preview: {
        host: '0.0.0.0',
        allowedHosts: allowedHosts.length > 0 ? allowedHosts : ['localhost']
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
