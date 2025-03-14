<template>
  <div id="widget-container"></div>
</template>

<script setup>
import { onMounted } from 'vue'
import OktaSignIn from '@okta/okta-signin-widget'

const oktaSignIn = new OktaSignIn(
  {
    issuer: import.meta.env.VITE_ISSUER,
    clientId: import.meta.env.VITE_CLIENT_ID,
    redirectUri: window.location.origin,
  }
)

onMounted(() => {
  oktaSignIn.showSignIn({ el: '#widget-container' }).then(
    function(res) {
      // Most flows will not require any redirection. In these cases, tokens will be returned directly.
      // res.tokens is an object
      oktaSignIn.authClient.handleLoginRedirect(res.tokens)
      oktaSignIn.hide();

    }).catch(function(error) {
      // This function is invoked with errors the widget cannot recover from:
      // Known errors: CONFIG_ERROR, UNSUPPORTED_BROWSER_ERROR
    })
})
</script>

<style scoped>
</style>