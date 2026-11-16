import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Отдельный конфиг для тестов: у клиента (vite.config.ts) корень — game/, а тесты лежат в tests/.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: { include: ["tests/**/*.test.ts"] },
});
