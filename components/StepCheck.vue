<template>
  <section class="card-modern p-5 mt-4 text-theme">
    <h1 class="text-2xl font-semibold">
      Checking your radio
    </h1>
    <div class="mt-3">
      <WaitPanel
        label="Asking the radio what it is and what software it runs."
        :countdown="state.wait"
        note="Don't unplug it. Usually a few seconds."
        next="your name, or installing the radio's software if it needs it."
      >
        <template #expired>
          Still waiting for an answer. If nothing happens in the next few seconds, you'll get a screen with what to do.
        </template>
      </WaitPanel>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useSetup } from '~/composables/useSetup'

const { state } = useSetup()
</script>
