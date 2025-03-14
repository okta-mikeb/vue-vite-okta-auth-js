<template>
  <v-container>
    <h3>Authentication with Okta AuthJS + IDX API</h3>

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
          v-if="showUsername"
          v-model="username"
          label="Username"
          type="email"
          hint="Enter your username"
          @keydown.enter.prevent="submit"
        ></v-text-field>

        <v-text-field
          v-if="showPassword"
          v-model="password"
          label="Password"
          type="password"
          hint="Enter your password"
          @keydown.enter.prevent="submit"
        ></v-text-field>
      </v-form>

      <v-alert
        v-if="error !== null"
        closable
        title="Error"
        :text="error"
        type="error"></v-alert>
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
            :disabled="(showUsername && username.trim().length === 0) || (showPassword && password.trim().length === 0)"
            @click="submit"
          >Submit</v-btn>
        </v-col>
        <v-col v-if="authState.isAuthenticated">
          <v-btn
            color="primary"
            @click="logout"
          >Logout</v-btn>
        </v-col>
        <v-col v-if="!authState.isAuthenticated && showVerifyWithEmail">
          <v-btn
            color="secondary"
            @click="verifyWithEmail"
          >Verify with Email</v-btn>
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

      <v-container class="d-flex">
        <v-card v-for="authenticator in authenticators" width="180px" class="ma-2">
          <v-card-title>{{ authenticator.label }}</v-card-title>
          <v-card-actions>
            <v-btn
              color="primary"
              @click="submitAuthenticatorForVerification(authenticator.value)"
            >Use</v-btn>
          </v-card-actions>
        </v-card>
      </v-container>
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

    <v-container>
      <v-row>
        <v-col v-if="!authState.isAuthenticated && showCancel">
          <v-btn
            color="secondary"
            @click="cancel"
          >Cancel</v-btn>
        </v-col>
      </v-row>
    </v-container>
  </v-container>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { OktaAuth } from '@okta/okta-auth-js'

const showUsername = ref(false)
const username = ref('')
const showPassword = ref(false)
const password = ref('')

const showSubmit = ref(false)
const showCancel = ref(false)
const showVerifyWithEmail = ref(false)

const emailOTP = ref('')
const authenticators = ref([])
const authenticatorData = ref([])
const pollingAuthenticator = ref(null)

const enrollAuthenticator = ref(false)
const enrollQRCode = ref('')

const error = ref(null)

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

function isInputRequired(name) {
  if (!appState.value || !appState.value.transaction) {
    return false
  }

  const nextStep = appState.value.transaction.nextStep
  return nextStep.inputs.some(input => input.name === name)
}

function showError(msg) {
  console.error(msg)

  // Show error on screen
  error.value = msg[0].message
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

function showLoading() {
  loading.value = true
}

function hideLoading() {
  loading.value = false
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
  }).catch(function (error) {
    // This is expected when Okta SSO does not exist
    showError(error)
  })
}

function endAuthFlow(tokens) {
  authClient.tokenManager.setTokens(tokens)
}

async function cancel() {
  await authClient.idx.cancel()
    .then(handleTransaction)
    .catch(showError)
}

async function verifyWithEmail() {
  // Clear any current errors
  error.value = null

  authenticatorData.value = []

  // TODO: Should re-prompt for an authenticator within the UI
  // (no request required until after selection)

  // Switch to email authenticator
  const authOptions = {
    authenticator: 'okta_email',
    methodType: 'email'
  }

  // Simulate Email authenticator selection
  await authClient.idx.proceed(authOptions)
    .then(handleTransaction)
    .catch(showError)
}

async function submit() {
  // Clear any current errors
  error.value = null

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

  // clear the authenticator list
  authenticators.value = []

  if (authenticator === 'okta_email') {
    await authClient.idx.proceed({ authenticator, methodType: 'email' })
      .then(handleTransaction)
      .catch(showError)
  } else {
    await authClient.idx.proceed({ authenticator })
      .then(handleTransaction)
      .catch(showError)
  }
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

function renderDynamicForm(transaction) {
  // Check all required form inputs
  const nextStep = transaction.nextStep

  // Hide all inputs to start
  showSubmit.value = false
  showUsername.value = false
  showPassword.value = false

  // Determine other button visibility
  showCancel.value = false
  showVerifyWithEmail.value = false

  // No next step
  if (!nextStep || transaction.status === 'CANCELED') return

  const inputs = transaction.nextStep.inputs
  const availableSteps = transaction.availableSteps

  if (inputs.some(input => input.name === 'username')) {
    // show username input
    showUsername.value = true
    showSubmit.value = true
  }
  if (inputs.some(input => input.name === 'password')) {
    // show password input
    showPassword.value = true
    showSubmit.value = true
  }

  if (
    availableSteps.some(step => step.name === 'cancel') &&
    !availableSteps.some(step => step.name === 'identify')
  ) {
    // show the cancel button
    showCancel.value = true
  }

  // Show verify with email (if available)
  const selectAuthenticator = availableSteps.filter(
    step => step.name === 'select-authenticator-authenticate'
  )

  if (selectAuthenticator.length > 0) {
    if (
      selectAuthenticator[0].inputs[0].options.some(option => option.value === 'okta_email') &&
      nextStep.name !== 'select-authenticator-authenticate' &&
      nextStep.type !== 'email'
    ) {
      showVerifyWithEmail.value = true
    }
  }
}

function handleTransaction(transaction) {
  // Handle IDX transaction
  if (transaction.messages) {
    showError(transaction.messages)
  }

  console.log('handleTransaction: ', transaction)

  // Handle form rendering
  renderDynamicForm(transaction)

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
  // Clear any current errors
  error.value = null

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
      break
    case 'password':
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