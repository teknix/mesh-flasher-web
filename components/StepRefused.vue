<template>
  <section class="card-modern p-5 mt-4 text-theme">
    <h1 class="text-2xl font-semibold">
      This radio isn't one this group supports yet
    </h1>
    <p class="mt-3 text-base">
      Your radio says it is: <strong>{{ state.refusedLabel }}</strong>.
    </p>
    <p class="mt-3 text-base">
      Nothing was changed on it. Send the name above to {{ helpContact }} and they will tell you what to do.
    </p>
    <button type="button" class="btn-secondary w-full mt-5 min-h-[52px] text-base" @click="go('plug')">
      Try a different radio
    </button>
  </section>
</template>

<script setup lang="ts">
import { useSetup } from '~/composables/useSetup'

const { state, helpContact, go } = useSetup()
</script>
