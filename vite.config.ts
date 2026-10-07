import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The page reads nothing from .env (keys stay on the server), so Modelos saving a key or Demucs' path there must not
  // restart Vite and reload the app in the middle of a piece.
  envDir: false,
  server: {
    host: true,
    proxy: { "/api": `http://localhost:${process.env.PORT || 8787}` },
    // Puppet uploads and project saves write here. They are not source, and a reload would close Editar serie.
    watch: { ignored: ["**/biblioteca/**", "**/proyectos/**", "**/publicidad/**", "**/server/series/**"] },
  },
});
