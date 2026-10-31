<template>
  <section class="card-modern p-5 mt-4 text-theme">
    <h1 class="text-2xl font-semibold">
      Install the radio's software
    </h1>
    <p class="mt-3 text-base">
      {{ state.snapshot?.firmwareVersion ? 'Your radio has an older version. It needs the one your group uses.' : 'Your radio needs the software your group uses.' }}
    </p>

    <label v-if="boards.length > 1 && !state.boardId" class="block mt-4 text-sm">
      Which radio is this?
      <select v-model="state.boardId" class="mt-1 w-full rounded-lg px-3 py-3 text-base bg-surface-secondary border border-theme text-theme">
        <option value="" disabled>
          Choose...
        </option>
        <option v-for="b in boards" :key="b" :value="b">
          {{ cfgBoards[b]?.displayName || b }}
        </option>
      </select>
    </label>

    <div v-if="needsDfuScreen" class="mt-5">
      <img src="/img/heltec_v4.svg" alt="The radio, with the PRG and RST buttons on its side" class="w-full max-w-[260px] mx-auto">
      <ol class="mt-4 space-y-2 text-base list-decimal ps-5">
        <li>Hold down the PRG button.</li>
        <li>While holding it, tap RST once.</li>
        <li>Let go of PRG.</li>
      </ol>
      <p class="mt-3 text-sm text-theme-muted">
        It's safe. This can't break the radio.
      </p>
      <button type="button" class="btn-primary w-full mt-5 min-h-[52px] text-base" @click="state.dfuReady = true">
        I did that
      </button>
    </div>

    <div v-else-if="state.busy" class="mt-5" role="status">
      <p class="text-base">
        {{ state.installPhase === 'download' ? 'Getting the software...' : state.installPhase === 'restart' ? 'Restarting the radio...' : 'Installing...' }}
      </p>
      <div class="mt-2 h-4 rounded-full progress-track overflow-hidden">
        <div class="h-full rounded-full bg-gradient-to-r from-green-400 to-green-600 transition-all" :style="{ width: state.installPercent + '%' }" />
      </div>
      <p class="mt-2 text-sm text-theme-muted">
        {{ state.installPercent }}%
      </p>
      <p v-if="state.installPhase === 'restart'" class="mt-2 text-sm text-theme-muted">
        If the radio doesn't come back on its own, tap RST once.
      </p>
      <p class="mt-3 text-base font-semibold">
        Don't unplug, don't close this page, about 3 minutes.
      </p>
    </div>

    <template v-else>
      <p v-if="state.error" class="mt-4 text-error" role="alert">
        {{ state.error }}
      </p>
      <button type="button" class="btn-primary w-full mt-5 min-h-[52px] text-base" :disabled="!state.boardId" @click="installSoftware">
        {{ state.error ? 'Try again' : 'Install the software' }}
      </button>
      <p class="mt-3 text-sm text-theme-muted">
        This erases the radio first. That is expected on a new radio.
      </p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSetup } from '~/composables/useSetup'

const { state, boards, board, installSoftware } = useSetup()
const cfgBoards = computed(() => state.cfg?.firmware.boards ?? {})
const needsDfuScreen = computed(() => !!state.boardId && !!board.value?.requiresDfu && !state.dfuReady && !state.busy)
</script>
