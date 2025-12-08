import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3000,
    proxy: {
      "/horizon": {
        target: "http://localhost:8181",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
