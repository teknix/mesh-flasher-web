<template>
  <section class="card-modern p-5 mt-4 text-theme">
    <h1 class="text-2xl font-semibold">
      Your name
    </h1>
    <p class="mt-3 text-sm text-theme-muted">
      Other people on the mesh will see this. Use a handle, not your full real name.
    </p>
    <form class="mt-4 space-y-4" @submit.prevent="setupRadio">
      <label class="block text-sm">
        Display name
        <input :value="state.longName" type="text" maxlength="39" required autocomplete="off"
               class="mt-1 w-full rounded-lg px-3 py-3 text-base bg-surface-secondary border border-theme text-theme"
               @input="setLongName(($event.target as HTMLInputElement).value)">
      </label>
      <label class="block text-sm">
        Short name
        <input :value="state.shortName" type="text" maxlength="4" required autocomplete="off"
               class="mt-1 w-32 rounded-lg px-3 py-3 text-base uppercase bg-surface-secondary border border-theme text-theme"
               @input="setShortName(($event.target as HTMLInputElement).value)">
      </label>
      <p class="text-sm text-theme-muted">
        The short name shows on the radio's small screen.
      </p>
      <p v-if="state.error || (!nameCheck.ok && state.longName)" class="text-error" role="alert">
        {{ state.error || nameCheck.problem }}
      </p>
      <button type="submit" class="btn-primary w-full min-h-[52px] text-base" :disabled="!nameCheck.ok">
        Set up my radio
      </button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { useSetup } from '~/composables/useSetup'

const { state, nameCheck, setLongName, setShortName, setupRadio } = useSetup()
</script>
