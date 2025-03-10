<template>
  <v-container>
    <h3>Authentication with Okta AuthJS + IDX API</h3>

    <RouterView></RouterView>

    <v-row>
      <v-col>
        <v-progress-linear
          v-if="loading"
          height="25"
          color="primary"
          indeterminate
        ></v-progress-linear>
      </v-col>
    </v-row>

    <v-container v-if="authState.isAuthenticated">
      <v-row>
        <v-col>
          Welcome, {{ appState.userInfo?.name }}!
        </v-col>
      </v-row>
    </v-container>
    <v-container>
      <v-form>
        <v-text-field
          v-if="isInputRequired('username')"
          v-model="username"
          label="Username"
          type="email"
          hint="Enter your username"
          @keydown.enter.prevent="submit"
        ></v-text-field>

        <v-text-field
          v-if="isInputRequired('password')"
          v-model="password"
          label="Password"
          type="password"
          hint="Enter your password"
          @keydown.enter.prevent="submit"
        ></v-text-field>
      </v-form>
    </v-container>

    <v-container v-if="isInputRequired('verificationCode')">
      <v-row>
        <v-col>
          <v-otp-input v-model="emailOTP">
          </v-otp-input>
        </v-col>
      </v-row>
      <v-row>
        <v-col>
          <v-btn
            color="primary"
            @click="submitEmailOTP"
          >
            Verify OTP
          </v-btn>
        </v-col>
      </v-row>
    </v-container>

    <v-container v-if="enrollAuthenticator">
      <v-row>
        <v-col>
          <v-img :src="enrollQRCode"></v-img>
        </v-col>
      </v-row>
    </v-container>

    <v-container>
      <v-row>
        <v-col v-if="!authState.isAuthenticated && showSubmit">
          <v-btn
            color="primary"
            :disabled="username.trim().length === 0"
            @click="submit"
          >Submit</v-btn>
        </v-col>
        <v-col v-if="authState.isAuthenticated">
          <v-btn
            color="primary"
            @click="logout"
          >Logout</v-btn>
        </v-col>
        <v-col v-if="!authState.isAuthenticated && isCancelAvailable()">
          <v-btn
            color="secondary"
            @click="cancel"
          >Cancel</v-btn>
        </v-col>
      </v-row>
    </v-container>

    <v-container v-if="pollingAuthenticator">
      <v-row>
        <v-col>
          Waiting for authenticator confirmation...
        </v-col>
      </v-row>

      <v-card>
        <v-card-title>{{ pollingAuthenticator.displayName }}</v-card-title>
      </v-card>
    </v-container>

    <v-container v-if="authenticators.length > 0">
      <v-row>
        <v-col>
          Select the required authenticator to proceed.
        </v-col>
      </v-row>

      <v-card v-for="authenticator in authenticators">
        <v-card-title>{{ authenticator.label }}</v-card-title>
        <v-card-actions>
          <v-btn
            color="primary"
            @click="submitAuthenticatorForVerification(authenticator.value)"
          >Use</v-btn>
        </v-card-actions>
      </v-card>
    </v-container>

    <v-container v-if="authenticatorData.length > 0">
      <v-row>
        <v-col>
          Select the required authenticator type to proceed.
        </v-col>
      </v-row>

      <v-card v-for="method in authenticatorData">
        <v-card-title>{{ method.label }}</v-card-title>
        <v-card-actions>
          <v-btn
            color="primary"
            @click="submitAuthenticatorDataForVerification(method.value)"
          >Use</v-btn>
        </v-card-actions>
      </v-card>
    </v-container>
  </v-container>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { OktaAuth } from '@okta/okta-auth-js'

import { RouterView } from 'vue-router'

const username = ref('')
const password = ref('')
const passwordRequired = ref(false)
const emailOTP = ref('')
const emailChallengeRequired = ref(false)
const authenticators = ref([])
const authenticatorData = ref([])
const pollingAuthenticator = ref(null)

const enrollAuthenticator = ref(false)
const enrollQRCode = ref('')

const authenticatorOptions = {
  authenticator: '',
  methodType: ''
}

const config = {
  issuer: import.meta.env.VITE_ISSUER,
  clientId: import.meta.env.VITE_CLIENT_ID,
  scopes: ['openid', 'profile', 'email', 'offline_access'],
  storage: 'sessionStorage',
  requireUserSession: true,
  authMethod: 'form',
  startService: true
}

let authClient = null
const appState = ref({})
const authState = ref({})
const loading = ref(false)

const showSubmit = computed(() => {
  const availableSteps = appState.value.transaction?.availableSteps
  if (!availableSteps) return false

  return availableSteps.some(step => {
    return (step.name === 'challenge-authenticator' && step.type === 'password') ||
      step.name === 'identify'
  })
})

function isInputRequired(name) {
  if (!appState.value || !appState.value.transaction) {
    return false
  }

  const nextStep = appState.value.transaction.nextStep
  return nextStep.inputs.some(input => input.name === name)
}

function isCancelAvailable() {
  if (!appState.value || !appState.value.transaction || !authClient) {
    return false
  }

  const nextStep = appState.value.transaction.nextStep
  // Don't present "Cancel" prior to identification
  if (nextStep.name === 'identify') {
    return false
  }

  return appState.value.transaction.availableSteps.some(step => step.name === 'cancel')
}

function showError(msg) {
  console.error(msg)
}

function updateAppState(newState) {
  Object.assign(appState.value, newState)
}

// Modifies the "authState" object before it is emitted. This is a chance to add custom logic and extra properties.
function transformAuthState(_authClient, localAuthState) {
  var promise = Promise.resolve(localAuthState)

  if (localAuthState.accessToken && localAuthState.idToken) {
    localAuthState.hasTokens = true
  }

  // With this option we require the user to have not only valid tokens, but a valid Okta SSO session as well
  if (config.requireUserSession && localAuthState.hasTokens) {
    promise = promise.then(function () {
      return appState.value.userInfo || authClient.token.getUserInfo()
    }).then(function (value) {
      updateAppState({ userInfo: value })
      localAuthState.isAuthenticated = localAuthState.isAuthenticated && !!appState.value.userInfo
      return localAuthState
    })
  }

  return promise
}

onMounted(async () => {
  const url = new URL(window.location.href)
  const clientId = url.searchParams.get("client_id") || config.clientId
  const redirectUri = url.searchParams.get("redirect_uri") || config.redirectUri
  const scopes = url.searchParams.get("scope") ? url.searchParams.get("scope").split(" ") : config.scopes

  try {
    authClient = new OktaAuth({
      issuer: config.issuer,
      clientId: clientId,
      redirectUri: redirectUri,
      scopes: scopes,
      tokenManager: {
        storage: config.storage
      },
      transformAuthState
    })
  } catch (error) {
    return showError(error)
  }

  authClient.authStateManager.subscribe(authState => {
    console.log('AuthState updated: ', authState)

    if (!authState.isAuthenticated) {
      // If not authenticated, reset values related to user session
      updateAppState({ userInfo: null })
    }

    renderApp()
  })

  // Start the token auto-renew service
  authClient.start()

  await authClient.idx.authenticate()
    .then(handleTransaction)
    .catch(() => {
      // Maybe session expired, clear transaction...
      authClient.transactionManager.clear()

      // showError(err)
    })
})

function renderApp() {
  authState.value = authClient.authStateManager.getAuthState()

  if (!authState.value) {
    return showLoading()
  }

  hideLoading()

  if (!authState.isAuthenticated) {
    renderUnauthenticated()
  }
}

function showLoading() {
  loading.value = true
}

function hideLoading() {
  loading.value = false
}

function renderUnauthenticated() {
  if (!authClient || authClient.token.isLoginRedirect()) {
    return
  }
}

function handleLoginRedirect() {
  if (authClient.idx.isInteractionRequired()) {
    return Promise.resolve()
  }

  return authClient.token.parseFromUrl().then(function (res) {
    endAuthFlow(res.tokens)
  }).catch(function (error) {
    showError(error)
  })
}

function getUserInfo() {
  return authClient.token.getUserInfo().then(function (value) {
    updateAppState({ userInfo: value })
    renderApp()
  }).catch(function (error) {
    // This is expected when Okta SSO does not exist
    showError(error)
  })
}

function endAuthFlow(tokens) {
  authClient.tokenManager.setTokens(tokens)
}

async function cancel() {
  authClient.idx.cancel()
    .then(handleTransaction)
    .catch(showError)
}

async function submit() {
  let nextStep = undefined
  if (appState.value.transaction) {
    nextStep = appState.value.transaction.nextStep
  }

  if (password.value.trim() !== '') {
    if (nextStep !== undefined && nextStep.authenticator?.type === 'password') {
      // await authClient.idx.proceed({ password: password.value })
      await authClient.idx.authenticate({ password: password.value })
        .then(handleTransaction)
        .catch(showError)
    } else {
      // await authClient.idx.proceed({
      await authClient.idx.authenticate({
        username: username.value,
        password: password.value
      })
        .then(handleTransaction)
        .catch(showError)
    }
  } else {
    // await authClient.idx.proceed({ username: username.value })
    await authClient.idx.authenticate({ username: username.value })
      .then(handleTransaction)
      .catch((err) => {
        // TODO: an error occurred, try to restart the transaction
        // and show an error
        authClient.transactionManager.clear()
        showError(err)
      })
  }
}

async function logout() {
  const signoutRedirectUrl = authClient.getSignOutRedirectUrl()
  console.log(signoutRedirectUrl)

  appState.value = {
    signedOut: true
  }

  const clearTokensBeforeRedirect = config.storage === 'memory'
  authClient.signOut({ clearTokensBeforeRedirect })
}

function resumeTransaction(options) {
  if (authClient.transactionManager.exists(options)) {
    return authClient.idx.proceed(options)
      .then(handleTransaction)
      .catch(showError)
  }
}

async function submitAuthenticatorForVerification(authenticator) {
  authenticatorOptions.authenticator = authenticator

  // clear the authenticator options
  authenticators.value = []

  await authClient.idx.proceed({ authenticator })
    .then(handleTransaction)
    .catch(showError)
}

async function submitAuthenticatorDataForVerification(method) {
  authenticatorOptions.methodType = method

  await authClient.idx.proceed(authenticatorOptions)
    .then(handleTransaction)
    .catch(showError)
}

async function pollForResult(refresh) {
  await authClient.idx.poll(refresh)
    .then(handleTransaction)
    .catch(showError)
}

async function handleSkip() {
  await authClient.idx.proceed({ skip: true })
    .then(handleTransaction)
    .catch(showError)
}

function handleTransaction(transaction) {
  // Handle IDX transaction
  if (transaction.messages) {
    showError(transaction.messages)
  }

  console.log('handleTransaction transaction: ', transaction)

  switch (transaction.status) {
    case 'PENDING':
      if (transaction.nextStep.canSkip) {
        return handleSkip()
      }
      // Update the application state transaction
      updateAppState({ transaction })

      if (transaction.nextStep.name === 'identify') {
        break
      }

      showAuthenticators()
      break
    case 'FAILURE':
      const error = transaction.error
      authClient.transactionManager.clear()
      showError(error)
      break
    case 'SUCCESS':
      pollingAuthenticator.value = null
      endAuthFlow(transaction.tokens)
      break
    case 'CANCELED':
      // Restart the flow
      window.location.href = '/'
      break
    default:
      throw new Error(transaction.status + ' status')
  }
}

async function submitEmailOTP() {
  await authClient.idx.proceed({ verificationCode: emailOTP.value })
    .then(handleTransaction)
    .catch(showError)
}

const isCredentialsApiAvailable = () => (
  !!(navigator && navigator.credentials && navigator.credentials.create)
)

async function showSecurityKeyChallenge() {
  if (!isCredentialsApiAvailable) {
    throw new Error('Credentials API is not available, WebAuthN not supported.')
  }

  const nextStep = appState.value.transaction.nextStep
  if (!nextStep) {
    throw new Error('Missing transaction nextStep.')
  }

  const challengeData = nextStep.authenticator.contextualData.challengeData
  const authenticatorEnrollments = nextStep.authenticatorEnrollments

  const options = OktaAuth.webauthn.buildCredentialRequestOptions(
    challengeData,
    authenticatorEnrollments
  )

  const credentials = await navigator.credentials.get(options)
  const response = OktaAuth.webauthn.getAssertion(credentials)
  console.log('response: ', response)
}

function showAuthenticatorChallenge() {
  const authenticator = appState.value.transaction.nextStep.authenticator

  switch (authenticator.type) {
    case 'email':
      emailChallengeRequired.value = true
      break
    case 'password':
      // Password field should be provided, show it
      passwordRequired.value = true
      break
    case 'security_key':
      showSecurityKeyChallenge()
      break
    default:
      // Throw errors for unhandled authenticators (so they can be added)
      throw new Error(`TODO: showAuthenticatorChallenge: handle authenticator type: ${authenticator.type}`)
  }
}

async function showAuthenticators() {
  const transaction = appState.value.transaction

  if (transaction.status === 'PENDING') {
    const nextStep = transaction.nextStep

    switch (nextStep.name) {
      case 'select-authenticator-enroll':
        authenticators.value = nextStep.inputs[0].options
        break
      case 'authenticator-verification-data':
        authenticators.value = []
        authenticatorData.value = nextStep.inputs[0].options
        break
      // case 'enroll-authenticator':
      case 'challenge-authenticator':
        showAuthenticatorChallenge()
        break
      case 'select-authenticator-authenticate':
        authenticators.value = nextStep.inputs[0].options
        break
      case 'enroll-poll':
        enrollQRCode.value = nextStep.authenticator.contextualData.qrcode.href
        enrollAuthenticator.value = true

        // Poll for the enroll result
        setTimeout(() => {
          pollForResult(nextStep.poll.refresh)
        }, nextStep.poll.refresh || 4000)

        break
      case 'challenge-poll':
        authenticatorData.value = []
        // Show polling authenticator
        pollingAuthenticator.value = transaction.nextStep.authenticator

        // Poll for the challenge result
        setTimeout(() => {
          pollForResult(nextStep.poll.refresh)
        }, nextStep.poll.refresh || 4000)

        break
      default:
        // Throw errors for unhandled nextStep states (so they can be added)
        throw new Error(`TODO: showAuthenticators: handle nextStep: ${nextStep.name}`)
    }
  }
}
</script>

<style scoped>
</style>