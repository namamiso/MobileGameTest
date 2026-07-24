import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // React コンポーネントテストは方針として対象外(TECH_DESIGN §13)。
    // 方針転換時は environment: 'jsdom' と @vitejs/plugin-react の導入が必要。
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
