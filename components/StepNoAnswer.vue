<template>
  <section class="card-modern p-5 mt-4 text-theme">
    <h1 class="text-2xl font-semibold">
      The radio didn't answer
    </h1>

    <template v-if="state.afterInstall">
      <p class="mt-3 text-base">
        The software is installed, but the radio hasn't started talking yet.
      </p>
      <ol class="mt-4 space-y-2 text-base list-decimal ps-5">
        <li>Look at the radio: it should show the Meshtastic logo, then a screen with its name. If it's dark, tap the <strong>RST</strong> button once.</li>
        <li>Wait until the screen is on, then press the button below.</li>
      </ol>
      <button type="button" class="btn-primary w-full mt-5 min-h-[52px] text-base" @click="pickRadio">
        Pick your radio again
      </button>
    </template>

    <template v-else>
      <p class="mt-3 text-base">
        The computer sees something on the cable, but nothing came back from it. Almost always this is the cable or the port, not the radio.
      </p>
      <ol class="mt-4 space-y-2 text-base list-decimal ps-5">
        <li>Use the cable from the envelope. <strong>Charging-only cables look identical</strong> and don't carry data.</li>
        <li>Plug straight into the computer, not a hub.</li>
        <li>Make sure the radio's screen is on, then press the button below.</li>
      </ol>
      <button type="button" class="btn-primary w-full mt-5 min-h-[52px] text-base" @click="pickRadio">
        Pick your radio again
      </button>

      <details class="mt-5 text-sm text-theme-muted">
        <summary class="cursor-pointer min-h-[44px] flex items-center">
          My radio is brand new and has never had Meshtastic on it
        </summary>
        <p class="mt-2">
          Then it can't answer yet — it needs the software first. This takes about 3 minutes and is safe.
        </p>
        <button type="button" class="btn-secondary w-full mt-3 min-h-[48px]" @click="installAnyway">
          Install the software on a new radio
        </button>
      </details>
    </template>

    <p v-if="state.error" class="mt-4 text-error" role="alert">
      {{ state.error }}
    </p>
    <p v-if="state.pickerNote" class="mt-3 text-sm text-theme-muted">
      {{ state.pickerNote }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { useSetup } from '~/composables/useSetup'

const { state, pickRadio, installAnyway } = useSetup()
</script>
