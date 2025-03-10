import { createApp } from "vue";
import { createWebHistory, createRouter } from "vue-router";
import "./style.css";
import App from "./App.vue";

import "vuetify/styles";
import { createVuetify } from "vuetify";

import IndexPage from "./components/IndexPage.vue";

const vuetify = createVuetify();

const router = new createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: IndexPage,
    },
  ],
});

createApp(App).use(router).use(vuetify).mount("#app");
