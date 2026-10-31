<template>
  <section class="card-modern p-5 mt-4 text-theme">
    <h1 class="text-2xl font-semibold">
      Sign in
    </h1>
    <p v-if="state.signinNote" class="mt-3 text-warning" role="alert">
      {{ state.signinNote }}
    </p>

    <form v-if="state.site?.group.auth !== 'matrix'" class="mt-4 space-y-4" @submit.prevent="submit">
      <p class="text-base">
        Use the same email and password you use on Bring It Down chat.
      </p>
      <label class="block text-sm">
        Email
        <input v-model="email" type="email" required autocomplete="username" inputmode="email"
               class="mt-1 w-full rounded-lg px-3 py-3 text-base bg-surface-secondary border border-theme text-theme">
      </label>
      <label class="block text-sm">
        Password
        <input v-model="password" type="password" required autocomplete="current-password"
               class="mt-1 w-full rounded-lg px-3 py-3 text-base bg-surface-secondary border border-theme text-theme">
      </label>
      <p class="text-sm text-theme-muted">
        We never ask for your password anywhere else. This is the only address that does: <strong class="text-theme break-all">{{ host }}</strong>
      </p>
      <p v-if="state.error" class="text-error" role="alert">
        {{ state.error }}
      </p>
      <button type="submit" class="btn-primary w-full min-h-[52px] text-base" :disabled="state.busy">
        {{ state.busy ? 'Signing in...' : 'Sign in' }}
      </button>
    </form>

    <div v-else class="mt-4 space-y-4">
      <p class="text-base">
        You sign in on your group's own sign-in page, then come straight back here. We never see your password.
      </p>
      <p v-if="state.error" class="text-error" role="alert">
        {{ state.error }}
      </p>
      <button type="button" class="btn-primary w-full min-h-[52px] text-base" :disabled="!state.site?.matrixReady" @click="signInMatrix">
        Sign in
      </button>
    </div>

    <div v-if="state.site?.joinText" class="mt-5 pt-4 border-t border-theme whitespace-pre-line text-sm">
      {{ state.site.joinText }}
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useSetup } from '~/composables/useSetup'

const { state, signInZulip, signInMatrix } = useSetup()
const email = ref('')
const password = ref('')
const host = location.host

async function submit() {
  await signInZulip(email.value, password.value)
  password.value = ''
}
</script>
