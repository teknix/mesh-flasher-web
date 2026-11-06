<template>
  <ol class="flex gap-1 text-xs mt-3" aria-label="Steps">
    <li
      v-for="(s, i) in items"
      :key="s.id"
      class="flex-1 min-w-0"
      :aria-current="i === current ? 'step' : undefined"
    >
      <div
        class="h-1.5 rounded-full"
        :class="i < current || current === items.length ? 'bg-meshtastic' : i === current ? 'bg-meshtastic/60' : 'progress-track'"
      />
      <p
        class="mt-1 truncate"
        :class="i === current ? 'text-theme font-semibold' : s.skipped ? 'text-theme-muted line-through' : 'text-theme-muted'"
      >
        {{ i + 1 }} {{ s.label }}
      </p>
    </li>
  </ol>
</template>

<script setup lang="ts">
// Where the member is in the flow. Five things, always the same order, so someone who has
// never done this knows what is left: Plug in · Install · Name · Set up · Check.
import { computed } from 'vue'
import type { Step } from '~/composables/useSetup'

const props = defineProps<{ step: Step, installSkipped: boolean }>()

const ORDER: Array<{ id: string, label: string, steps: Step[] }> = [
  { id: 'plug', label: 'Plug in', steps: ['plug', 'check', 'noanswer', 'refused'] },
  { id: 'install', label: 'Install', steps: ['install'] },
  { id: 'name', label: 'Name', steps: ['name'] },
  { id: 'setup', label: 'Set up', steps: ['setup'] },
  { id: 'verify', label: 'Check', steps: ['verify'] },
]

const items = computed(() => ORDER.map(o => ({ ...o, skipped: o.id === 'install' && props.installSkipped })))
/** Index of the current item; items.length when everything is done. */
const current = computed(() => {
  if (props.step === 'done') return ORDER.length
  const i = ORDER.findIndex(o => o.steps.includes(props.step))
  return i < 0 ? 0 : i
})
</script>
