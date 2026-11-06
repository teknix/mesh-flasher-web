// Fake flow states for screenshots (`?preview=<name>`, local builds with NUXT_PUBLIC_PREVIEW=1
// only). Lets every wait screen be looked at — at phone and desktop width — without a radio.
// Nothing here is a real group: placeholder names, an all-zero key, no broker password.
import { startCountdown } from '~/utils/countdown'
import { buildPlan, planSteps, bytesToBase64, type GroupConfig } from '~/utils/groupSetup'
import type { useSetup } from '~/composables/useSetup'

type State = ReturnType<typeof useSetup>['state']

const config: GroupConfig = {
  lora: { region: 'US', modemPreset: 'LONG_FAST', hopLimit: 3, txPower: 0 },
  channels: [{ index: 0, role: 'PRIMARY', name: 'Preview', psk: bytesToBase64(new Uint8Array(16)), uplink: true, downlink: true, positionPrecision: 13 }],
  mqtt: { address: 'mesh.example.net', username: 'preview', password: '', tls: true, root: 'msh/PREVIEW', encryption: true, json: false, mapReporting: false },
  device: { role: 'CLIENT' },
}

export const PREVIEWS = [
  'plug', 'check', 'check-expired', 'noanswer', 'noanswer-after', 'install-dfu', 'install-connect', 'install-erase',
  'install-write', 'install-firstboot', 'install-expired', 'name', 'setup', 'setup-saving', 'verify', 'verify-expired',
] as const

export function applyPreview(state: State, name: string) {
  const now = Date.now()
  state.site = { group: { id: 'preview', name: 'Preview Group', auth: 'matrix' }, firmware: {}, joinText: '', helpContact: 'Sam', matrixReady: true, signedIn: true }
  state.me = { signedIn: true, handle: '@sam:example.net', kind: 'matrix', csrf: '', suggestedName: 'Sam Example' }
  state.cfg = {
    version: 1,
    config,
    firmware: { version: '2.7.26.54e0d8d', boards: { 'heltec-v4': { hwModel: 110, displayName: 'Heltec V4', requiresDfu: true, clean: [], update: [] } } },
  } as unknown as State['cfg']
  state.longName = 'Sam Example'
  state.shortName = 'SE'
  state.boardId = 'heltec-v4'
  const ago = (s: number) => now - s * 1000

  const busyInstall = (phase: State['installPhase'], seconds: number | null, startedAgo = 0, percent = 0) => {
    state.step = 'install'
    state.needsInstall = true
    state.checked = true
    state.dfuReady = true
    state.busy = true
    state.installPhase = phase
    state.installPercent = percent
    state.phaseStartedAt = ago(startedAgo)
    state.wait = seconds === null ? null : startCountdown(seconds, ago(startedAgo))
  }

  switch (name) {
    case 'plug':
      state.step = 'plug'
      state.pickerNote = 'No radio in the list? Make sure the cable is a data cable — charging-only cables look the same — and try another USB port.'
      break
    case 'check':
      state.step = 'check'
      state.wait = startCountdown(25, ago(4))
      break
    case 'check-expired':
      state.step = 'check'
      state.wait = startCountdown(25, ago(26))
      break
    case 'noanswer':
      state.step = 'noanswer'
      break
    case 'noanswer-after':
      state.step = 'noanswer'
      state.afterInstall = true
      break
    case 'install-dfu':
      state.step = 'install'
      state.needsInstall = true
      state.checked = true
      state.dfuReady = false
      break
    case 'install-connect':
      busyInstall('connect', 45, 6)
      break
    case 'install-erase':
      busyInstall('erase', 120, 35)
      break
    case 'install-write':
      busyInstall('write', null, 40, 48)
      break
    case 'install-firstboot':
      busyInstall('firstboot', 90, 12)
      break
    case 'install-expired':
      busyInstall('firstboot', 90, 95)
      break
    case 'name':
      state.step = 'name'
      state.checked = true
      break
    case 'setup':
    case 'setup-saving': {
      const plan = buildPlan(config, { longName: 'Sam Example', shortName: 'SE' })
      state.step = 'setup'
      state.checked = true
      state.busy = true
      state.plan = plan
      state.steps = planSteps(plan)
      const ids = state.steps.map(s => s.id)
      const doneUpTo = name === 'setup' ? 3 : ids.length
      state.stepStates = Object.fromEntries(ids.map((id, i) => [id, i < doneUpTo ? 'done' : i === doneUpTo ? 'working' : 'pending']))
      if (name === 'setup-saving') {
        state.waitPhase = 'saving'
        state.wait = startCountdown(10, ago(3))
      }
      break
    }
    case 'verify':
    case 'verify-expired':
      state.step = 'verify'
      state.checked = true
      state.busy = true
      state.waitPhase = 'verify'
      state.wait = startCountdown(140, ago(name === 'verify' ? 20 : 141))
      break
    default:
      state.step = 'plug'
      state.error = `Unknown preview "${name}". Known: ${PREVIEWS.join(', ')}`
  }
}
