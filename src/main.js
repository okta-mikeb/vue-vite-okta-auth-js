import { createApp } from "vue";
import { createWebHistory, createRouter } from "vue-router";
import "./style.css";
import App from "./App.vue";

// Okta SIW styles
import '@okta/okta-signin-widget/css/okta-sign-in.min.css';

import "vuetify/styles";
import { createVuetify } from "vuetify";

import IndexPage from "./components/IndexPage.vue";
import EmbeddedPage from "./components/EmbeddedPage.vue";

const vuetify = createVuetify();

const router = new createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: IndexPage,
    },
    {
      path: "/embedded",
      component: EmbeddedPage
    }
  ],
});

createApp(App).use(router).use(vuetify).mount("#app");
