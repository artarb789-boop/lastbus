import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Клиент лежит в game/, а контент — в data/ уровнем выше.
// Пути абсолютные, чтобы сервер работал, из какой бы папки его ни запустили.
const projectDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./game", import.meta.url)),
  base: "./",
  server: { port: 5173, fs: { allow: [projectDir] } },
  build: {
    outDir: fileURLToPath(new URL("./dist", import.meta.url)),
    emptyOutDir: true,
    // Две страницы: игра и витрина картинок для художника.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./game/index.html", import.meta.url)),
        gallery: fileURLToPath(new URL("./game/gallery.html", import.meta.url)),
      },
    },
  },
});
