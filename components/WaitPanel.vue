<template>
  <div role="status" aria-live="polite">
    <p class="text-base font-semibold">
      {{ label }}
    </p>

    <!-- Real progress: a bar that moves. -->
    <template v-if="percent !== undefined">
      <div class="mt-2 h-4 rounded-full progress-track overflow-hidden">
        <div class="h-full rounded-full bg-gradient-to-r from-green-400 to-green-600 transition-all" :style="{ width: Math.min(100, Math.max(0, percent)) + '%' }" />
      </div>
      <p class="mt-1 text-sm text-theme-muted">
        {{ Math.round(percent) }}%<span v-if="eta !== null && eta !== undefined"> · about {{ formatSeconds(eta) }} left</span>
      </p>
    </template>

    <!-- Known wait: a countdown. Only shown for waits whose length we know. -->
    <template v-else-if="countdown">
      <div class="mt-2 h-2 rounded-full progress-track overflow-hidden">
        <div class="h-full rounded-full bg-meshtastic transition-all" :style="{ width: elapsedPercent(countdown, now) + '%' }" />
      </div>
      <p v-if="!expired" class="mt-1 text-sm text-theme-muted">
        Up to {{ formatSeconds(secondsLeft(countdown, now)) }} more
      </p>
      <p v-else class="mt-2 text-sm text-theme" role="alert">
        <slot name="expired">
          Taking longer than expected. Give it one more minute before doing anything.
        </slot>
      </p>
    </template>

    <!-- Unknown wait: a pulse, no promise. -->
    <div v-else class="mt-2 h-2 rounded-full progress-track overflow-hidden">
      <div class="h-full w-1/3 rounded-full bg-meshtastic animate-pulse" />
    </div>

    <p v-if="note" class="mt-2 text-sm text-theme-muted">
      {{ note }}
    </p>
    <p v-if="next" class="mt-2 text-sm">
      <span class="text-theme-muted">Next:</span> {{ next }}
    </p>
  </div>
</template>

<script setup lang="ts">
// One wait screen body for every pause in the flow: what is happening, how long it will take
// when we know, what the member will see next. A countdown is a promise — when it runs out
// the parent says the one thing to do (the `expired` slot).
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { secondsLeft, elapsedPercent, formatSeconds, type Countdown } from '~/utils/countdown'

const props = defineProps<{
  label: string
  /** Real progress 0..100 (download, write). */
  percent?: number
  /** Remaining seconds estimated from progress; null = not enough progress to say. */
  eta?: number | null
  /** A wait of known length. */
  countdown?: Countdown | null
  note?: string
  next?: string
}>()

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 250)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const expired = computed(() => !!props.countdown && secondsLeft(props.countdown, now.value) === 0)
</script>
