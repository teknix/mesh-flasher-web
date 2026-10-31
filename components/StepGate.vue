<template>
  <section class="card-modern p-5 mt-4 text-theme">
    <h1 class="text-2xl font-semibold">
      {{ state.gate?.reason === 'phone' ? 'You need a laptop or desktop with Chrome or Edge, not a phone' : 'This browser can\'t set up the radio' }}
    </h1>
    <p class="mt-3 text-base">
      {{ state.gate?.advice }}
    </p>

    <button type="button" class="btn-primary w-full mt-5 min-h-[52px] text-base" @click="sendLink">
      {{ note || 'Send myself this link' }}
    </button>

    <ul class="mt-5 space-y-2 text-sm text-theme-muted">
      <li><strong class="text-theme">Safari:</strong> {{ CASE_ADVICE.safari }}</li>
      <li><strong class="text-theme">Firefox:</strong> {{ CASE_ADVICE.firefox }}</li>
      <li><strong class="text-theme">Mac:</strong> {{ CASE_ADVICE.mac }}</li>
      <li><strong class="text-theme">Chromebook:</strong> {{ CASE_ADVICE.chromebook }}</li>
    </ul>
    <p class="mt-4">
      <a :href="CHROME_URL" rel="noopener" class="underline text-theme-accent">Download Chrome</a>
    </p>

    <div v-if="state.site?.joinText" class="mt-5 pt-4 border-t border-theme whitespace-pre-line text-sm">
      {{ state.site.joinText }}
    </div>
    <p v-if="state.site?.helpContact" class="mt-3 text-sm text-theme-muted">
      Questions? Contact {{ state.site.helpContact }}.
    </p>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useSetup } from '~/composables/useSetup'
import { CASE_ADVICE, CHROME_URL } from '~/utils/browserGate'

const { state, groupName } = useSetup()
const note = ref('')

async function sendLink() {
  const url = location.origin + '/'
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: `${groupName.value} radio setup`, url })
      return
    }
  }
  catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') return
  }
  try {
    await navigator.clipboard.writeText(url)
    note.value = 'Link copied. Paste it in an email or text to yourself.'
  }
  catch {
    note.value = `Copy this link: ${url}`
  }
}
</script>
