import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    proxy: { "/api": `http://localhost:${process.env.PORT || 8787}` },
    // Puppet uploads and project saves write here. They are not source, and a reload would close Editar serie.
    watch: { ignored: ["**/biblioteca/**", "**/proyectos/**", "**/publicidad/**", "**/server/series/**"] },
  },
});
