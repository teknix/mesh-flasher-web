<template>
  <section class="card-modern p-5 mt-4 text-theme">
    <h1 class="text-2xl font-semibold">
      Your radio is ready
    </h1>
    <ol class="mt-4 space-y-3 text-base list-decimal ps-5">
      <li>
        Install the Meshtastic app on your phone:
        <a href="https://play.google.com/store/apps/details?id=com.geeksville.mesh" rel="noopener" class="underline text-theme-accent">Google Play</a>
        or
        <a href="https://apps.apple.com/app/meshtastic/id1586432531" rel="noopener" class="underline text-theme-accent">App Store</a>.
      </li>
      <li>Pair the radio by Bluetooth. The PIN shows on the radio's screen.</li>
      <li>A red "Failed to deliver" in the app is normal when no one is near you.</li>
    </ol>

    <div class="mt-6 pt-4 border-t border-theme">
      <button type="button" class="btn-secondary w-full min-h-[52px] text-base" :disabled="state.uplinkBusy || !state.nodeId" @click="checkMesh">
        {{ state.uplinkBusy ? 'Listening... up to 20 seconds' : 'Check my radio is on the mesh' }}
      </button>
      <p class="mt-2 text-sm text-theme-muted">
        This works once the app is paired and has internet.
      </p>
      <p v-if="state.uplink" class="mt-3 text-base" role="status">
        <template v-if="state.uplink.seen">
          Seen. Your radio is on the mesh.
        </template>
        <template v-else>
          Not seen yet. {{ state.uplink.error ? state.uplink.error + ' ' : '' }}Pair the app, make sure your phone has internet, wait a minute, and check again.
        </template>
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useSetup } from '~/composables/useSetup'

const { state, checkMesh } = useSetup()
</script>
