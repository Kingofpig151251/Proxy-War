import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // 規則引擎必須全確定：禁任何隨機超時抖動
    testTimeout: 10000,
  },
});
