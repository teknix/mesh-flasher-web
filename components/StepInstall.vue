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
      <p class="text-sm text-theme-muted">
        First, put the radio in install mode. Two buttons on its side, three moves:
      </p>
      <img src="/img/heltec_v4.svg" alt="The radio, with the PRG and RST buttons on its side" class="w-full max-w-[260px] mx-auto mt-3">
      <ol class="mt-4 space-y-2 text-base list-decimal ps-5">
        <li>Hold down the PRG button.</li>
        <li>While holding it, tap RST once.</li>
        <li>Let go of PRG.</li>
      </ol>
      <p class="mt-3 text-sm text-theme-muted">
        The screen may stay dark or blank — that's install mode. It's safe; this can't break the radio.
      </p>
      <button type="button" class="btn-primary w-full mt-5 min-h-[52px] text-base" @click="state.dfuReady = true">
        I did that
      </button>
    </div>

    <div v-else-if="state.busy" class="mt-5">
      <WaitPanel
        :label="phase.label"
        :percent="phase.percent"
        :eta="phase.eta"
        :countdown="phase.countdown"
        :note="phase.note"
        :next="phase.next"
      >
        <template #expired>
          {{ phase.expired }}
        </template>
      </WaitPanel>
      <p class="mt-4 text-base font-semibold">
        Don't unplug, don't close this page. About 3 minutes in all.
      </p>
    </div>

    <template v-else>
      <p v-if="state.error" class="mt-4 text-error" role="alert">
        {{ state.error }}
      </p>
      <p v-if="state.pickerNote" class="mt-3 text-sm text-theme-muted">
        {{ state.pickerNote }}
      </p>
      <button type="button" class="btn-primary w-full mt-5 min-h-[52px] text-base" :disabled="!state.boardId" @click="installSoftware">
        {{ state.error ? 'Try again' : 'Install the software' }}
      </button>
      <p class="mt-3 text-sm text-theme-muted">
        Chrome will ask you to pick the radio again. Pick it and press Connect.
      </p>
      <p class="mt-2 text-sm text-theme-muted">
        This erases the radio first. That is expected on a new radio.
      </p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSetup, WAIT } from '~/composables/useSetup'
import { remainingFromProgress } from '~/utils/countdown'

const { state, boards, board, installSoftware } = useSetup()
const cfgBoards = computed(() => state.cfg?.firmware.boards ?? {})
const needsDfuScreen = computed(() => !!state.boardId && !!board.value?.requiresDfu && !state.dfuReady && !state.busy)

/** What to show for each install phase: label, progress or countdown, what's next, what to do if the countdown runs out. */
const phase = computed(() => {
  const p = state.installPhase
  const pct = state.installPercent
  switch (p) {
    case 'download':
      return { label: 'Getting the software from the server...', percent: pct * 20, eta: null, countdown: null, note: 'About 10 seconds.', next: 'connecting to the radio.', expired: '' }
    case 'connect':
      return { label: 'Connecting to the radio\'s installer...', percent: undefined, eta: null, countdown: state.wait, note: 'The radio\'s screen stays dark while this happens.', next: 'wiping the radio, then installing.', expired: 'The radio is not answering. You\'ll get a Try again button in a moment: put it in install mode again (hold PRG, tap RST, let go) and retry.' }
    case 'erase':
      return { label: 'Wiping the radio...', percent: undefined, eta: null, countdown: state.wait, note: `Up to ${WAIT.erase / 60} minutes. Nothing moves on the radio and the bar below is the clock, not progress. That is normal.`, next: 'installing, with a bar that moves.', expired: 'Wiping is taking longer than usual. Give it another minute; if nothing changes you\'ll get a Try again button.' }
    case 'write': {
      const frac = Math.max(0, (pct - 5) / 95)
      return { label: 'Installing...', percent: pct, eta: remainingFromProgress(state.phaseStartedAt, frac), countdown: null, note: 'The bar moves now.', next: 'the radio restarts by itself.', expired: '' }
    }
    case 'reset':
      return { label: 'Restarting the radio...', percent: undefined, eta: null, countdown: state.wait, note: '', next: 'its first start, which takes a while.', expired: 'If the radio didn\'t restart, tap RST once.' }
    case 'firstboot':
      return { label: 'The radio is starting for the first time...', percent: undefined, eta: null, countdown: state.wait, note: 'Its screen goes dark, then shows the Meshtastic logo, then its name. It is setting up its storage — this is the longest wait.', next: 'choosing your name.', expired: 'Still starting. If the screen is dark, tap RST once. You\'ll get a button to continue in a moment.' }
    default:
      return { label: 'Installing...', percent: undefined, eta: null, countdown: null, note: '', next: '', expired: '' }
  }
})
</script>
