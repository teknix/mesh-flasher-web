<template>
  <section class="card-modern p-5 mt-4 text-theme">
    <h1 class="text-2xl font-semibold">
      Checking it took
    </h1>
    <div v-if="state.busy" class="mt-3">
      <WaitPanel
        label="Reading your radio back and comparing every setting."
        :countdown="state.wait"
        note="Usually under 30 seconds. The radio has just restarted, so the first tries may get no answer — that's expected."
        next="done, with a list of what was checked."
      >
        <template #expired>
          The radio hasn't answered yet. You'll get a Check again button in a moment; if the screen is dark, tap RST once first.
        </template>
      </WaitPanel>
    </div>
    <p v-if="!state.busy && state.error" class="mt-3 text-error" role="alert">
      {{ state.error }}
    </p>

    <ul v-if="state.fields.length" class="mt-4 space-y-1 text-sm">
      <li v-for="f in state.fields" :key="f.id" class="flex gap-3 min-h-[28px]">
        <span class="w-5 text-center" aria-hidden="true">{{ f.status === 'ok' ? '✓' : f.status === 'unreadable' ? '–' : '✗' }}</span>
        <span>{{ f.label }}<span v-if="f.status === 'unreadable'" class="text-theme-muted"> (the radio doesn't show this, so it can't be checked)</span></span>
      </li>
    </ul>

    <template v-if="!state.busy && failedFields.length">
      <p class="mt-4 text-error" role="alert">
        Radio did not accept: {{ failedFields.map(f => f.label).join(', ') }}. Nothing else was changed.
      </p>
      <button type="button" class="btn-primary w-full mt-4 min-h-[52px] text-base" @click="setupRadio">
        Try setting up again
      </button>
    </template>
    <button v-else-if="!state.busy && state.error" type="button" class="btn-primary w-full mt-4 min-h-[52px] text-base" @click="verifyRadio">
      Check again
    </button>
  </section>
</template>

<script setup lang="ts">
import { useSetup } from '~/composables/useSetup'

const { state, failedFields, setupRadio, verifyRadio } = useSetup()
</script>
