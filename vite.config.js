import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify from 'vite-plugin-vuetify';

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: '0.0.0.0'
  },
  plugins: [vue(), vuetify()]
});
