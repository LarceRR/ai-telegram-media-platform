import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0b0f14',
        panel: '#131a22',
        border: '#1f2a35',
      },
    },
  },
  plugins: [],
};

export default config;
