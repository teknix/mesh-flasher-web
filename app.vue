<template>
  <div class="min-h-screen flex flex-col">
    <header class="px-4 pt-4 pb-2 max-w-xl w-full mx-auto">
      <p class="text-sm text-theme-muted">
        {{ groupName }} radio setup
      </p>
    </header>

    <main class="flex-1 w-full max-w-xl mx-auto px-4 pb-6">
      <div v-if="state.step === 'loading'" class="card-modern p-6 mt-4 text-theme" role="status">
        Loading...
      </div>
      <StepGate v-else-if="state.step === 'gate'" />
      <StepSignIn v-else-if="state.step === 'signin'" />
      <StepPlug v-else-if="state.step === 'plug'" />
      <StepCheck v-else-if="state.step === 'check'" />
      <StepRefused v-else-if="state.step === 'refused'" />
      <StepInstall v-else-if="state.step === 'install'" />
      <StepName v-else-if="state.step === 'name'" />
      <StepSetup v-else-if="state.step === 'setup'" />
      <StepVerify v-else-if="state.step === 'verify'" />
      <StepDone v-else-if="state.step === 'done'" />

      <div v-if="state.step !== 'loading'" class="mt-4">
        <button type="button" class="btn-secondary w-full min-h-[48px]" @click="copyStuck">
          {{ copied ? 'Copied. Now paste it in a message.' : `Stuck? Copy this and send it to ${helpContact}` }}
        </button>
      </div>
    </main>

    <footer class="px-4 py-4 text-xs text-theme-muted max-w-xl w-full mx-auto">
      <p>For Meshtastic radios. Not an official Meshtastic site.</p>
      <p class="mt-1 break-words">
        Source: github.com/teknix/mesh-flasher-web @ {{ commit }} · GPL-3.0
      </p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSetup } from '~/composables/useSetup'

const { state, groupName, helpContact, init, stuckText } = useSetup()
const commit = useRuntimeConfig().public.commit as string
const copied = ref(false)

useHead({ title: computed(() => `${groupName.value} radio setup`) })

async function copyStuck() {
  const text = stuckText()
  try {
    await navigator.clipboard.writeText(text)
  }
  catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch { /* nothing more to try */ }
    ta.remove()
  }
  copied.value = true
  setTimeout(() => (copied.value = false), 4000)
}

onMounted(init)
</script>
