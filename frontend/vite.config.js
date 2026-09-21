import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev only: `npm run dev` proxies the API to a locally running backend.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
});
