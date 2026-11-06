<template>
  <section class="card-modern p-5 mt-4 text-theme">
    <h1 class="text-2xl font-semibold">
      Setting up your radio
    </h1>
    <p v-if="state.busy && state.waitPhase !== 'saving'" class="mt-3 text-base font-semibold" role="status">
      Don't unplug. Writing your group's settings, one at a time. About 20 seconds.
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
    <div v-if="state.busy && state.waitPhase === 'saving'" class="mt-4">
      <WaitPanel
        label="Saving and restarting the radio..."
        :countdown="state.wait"
        note="The radio's screen goes dark for a moment and comes back with your name on it."
        next="reading everything back to make sure it took."
      >
        <template #expired>
          The radio is taking a moment longer to come back. Leave it plugged in.
        </template>
      </WaitPanel>
    </div>
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
