import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    // Los flujos de punta a punta y las migraciones sobre PGlite pasan de 5 s en runners de CI lentos.
    testTimeout: 20_000,
    coverage: { provider: "v8", include: ["src/domain/**", "src/nlu/**", "src/services/**"] },
  },
});
