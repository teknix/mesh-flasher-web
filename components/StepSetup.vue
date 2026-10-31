<template>
  <section class="card-modern p-5 mt-4 text-theme">
    <h1 class="text-2xl font-semibold">
      Setting up your radio
    </h1>
    <p v-if="state.busy" class="mt-3 text-base font-semibold" role="status">
      Don't unplug. The radio restarts when it is done.
    </p>
    <ul class="mt-4 space-y-2">
      <li v-if="!state.steps.length" class="text-theme-muted">
        Connecting to your radio...
      </li>
      <li v-for="s in state.steps" :key="s.id" class="flex items-center gap-3 min-h-[36px]">
        <span class="w-6 text-center" aria-hidden="true">{{ icon(state.stepStates[s.id]) }}</span>
        <span>{{ s.label }}</span>
        <span class="sr-only">{{ state.stepStates[s.id] || 'waiting' }}</span>
      </li>
    </ul>
    <template v-if="!state.busy && state.error">
      <p class="mt-4 text-error" role="alert">
        {{ state.error }}
      </p>
      <button type="button" class="btn-primary w-full mt-4 min-h-[52px] text-base" @click="setupRadio">
        Try again
      </button>
    </template>
  </section>
</template>

<script setup lang="ts">
import { useSetup } from '~/composables/useSetup'
import type { StepState } from '~/utils/groupSetup'

const { state, setupRadio } = useSetup()
const icon = (s?: StepState) => s === 'done' ? '✓' : s === 'failed' ? '✗' : s === 'unconfirmed' ? '?' : s === 'working' ? '…' : '·'
</script>
