import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: [],
    // Coverage measured but NOT gated yet — Item 2.6 Decision 4 (measure first,
    // threshold gate becomes Movement 3 hygiene once we have baseline data).
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/db/migrate.ts',
      ],
    },
  },
})
