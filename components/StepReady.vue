<template>
  <section class="card-modern p-5 mt-4 text-theme">
    <h1 class="text-2xl font-semibold">
      Your radio is ready
    </h1>
    <ul class="mt-4 space-y-2 text-base">
      <li class="flex gap-3">
        <span aria-hidden="true">✓</span>
        <span>{{ boardLabel }}</span>
      </li>
      <li class="flex gap-3">
        <span aria-hidden="true">✓</span>
        <span>
          Software {{ version }} — recent, no install needed.
          <span v-if="state.readyNewer" class="text-theme-muted">(Newer than the version {{ groupName }} tested with. That's fine.)</span>
        </span>
      </li>
    </ul>

    <p class="mt-5 text-base">
      Apply <strong>{{ groupName }}</strong>'s settings to this radio?
    </p>
    <p class="mt-2 text-sm text-theme-muted">
      This writes the group's channel, radio settings and internet link, and sets your name. Whatever is on the radio now — channels, WiFi, another group's settings — is replaced. About a minute.
    </p>

    <button type="button" class="btn-primary w-full mt-5 min-h-[52px] text-base" @click="applyConfig">
      Yes, set it up for {{ groupName }}
    </button>
    <button type="button" class="btn-secondary w-full mt-3 min-h-[48px]" @click="leaveRadio">
      No, leave the radio as it is
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSetup } from '~/composables/useSetup'
import { shortVersion } from '~/utils/version'

const { state, board, groupName, applyConfig, leaveRadio } = useSetup()
const version = computed(() => shortVersion(state.snapshot?.firmwareVersion) || 'unknown')
const boardLabel = computed(() => board.value?.displayName || state.boardId || 'Radio')
</script>
