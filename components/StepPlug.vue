<template>
  <section class="card-modern p-5 mt-4 text-theme">
    <h1 class="text-2xl font-semibold">
      Plug in your radio
    </h1>
    <ol class="mt-4 space-y-3 text-base list-decimal ps-5">
      <li>Screw the antenna on first.</li>
      <li>Use the cable from the envelope. Some cables only charge and won't work.</li>
      <li>Plug the radio into this computer, then press the button below.</li>
    </ol>
    <p v-if="state.error" class="mt-4 text-error" role="alert">
      {{ state.error }}
    </p>
    <button type="button" class="btn-primary w-full mt-5 min-h-[52px] text-base" @click="pickRadio">
      Pick your radio
    </button>
    <details class="mt-4 text-sm text-theme-muted">
      <summary class="cursor-pointer min-h-[44px] flex items-center">
        My radio isn't in the list
      </summary>
      <p class="mt-2">
        Try a different cable (the one from the envelope), a different USB port, and make sure the antenna is on. If it still doesn't show, use the Stuck button below.
      </p>
    </details>
  </section>
</template>

<script setup lang="ts">
import { useSetup } from '~/composables/useSetup'

const { state, pickRadio } = useSetup()
</script>
