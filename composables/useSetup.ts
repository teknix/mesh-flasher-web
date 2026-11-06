// The whole member flow as one small state machine. State lives in memory only: the group
// config (channel keys, MQTT password) is never put in storage, URLs or logs.
import { reactive, computed } from 'vue'
import * as api from '~/utils/api'
import { detectGate, type GateResult } from '~/utils/browserGate'
import { suggestShortName, checkNames } from '~/utils/board'
import { openAndRead, openSession } from '~/utils/meshSession'
import { buildPlan, applyPlan, compareSnapshot, planSteps, readDevice, nodeIdFromNum, SetupError, type Plan, type PlanStep, type Snapshot, type StepState, type FieldResult } from '~/utils/groupSetup'
import { fetchVerified, flashImages, parseAddress, FirmwareError, type FlashPhase } from '~/utils/espFlash'
import { routeAfterRead, type CheckRoute } from '~/utils/checkRoute'
import { startCountdown, type Countdown } from '~/utils/countdown'
import { RADIO_USB_FILTERS } from '~/utils/usb'
import { openPortWithRetry } from '~/utils/serialTransport'

export type Step = 'loading' | 'gate' | 'signin' | 'plug' | 'check' | 'noanswer' | 'refused' | 'install' | 'ready' | 'name' | 'setup' | 'verify' | 'done'

export const STEP_NAMES: Record<Step, string> = {
  loading: 'Loading',
  gate: 'Browser check',
  signin: 'Sign in',
  plug: 'Plug in the radio',
  check: 'Checking your radio',
  noanswer: 'The radio did not answer',
  refused: 'Radio not supported',
  install: 'Installing the radio\'s software',
  ready: 'Radio is ready — apply the group settings?',
  name: 'Your name',
  setup: 'Setting up your radio',
  verify: 'Checking it took',
  done: 'Done',
}

// How long each wait may take. Every number here is shown to the member as a countdown, so
// each one is a promise: generous enough to be true, short enough to be useful.
export const WAIT = {
  /** The radio identifies itself within a second or two; 25 s covers a radio busy with a big node list. */
  check: 25,
  /** esptool connect limit (espFlash CONNECT_LIMIT) — the radio must be in install mode. */
  connect: 45,
  /** Full-chip erase on a 16 MB board (esptool CHIP_ERASE_TIMEOUT). The bar does not move. */
  erase: 120,
  /** Hard reset after the write. */
  reset: 5,
  /**
   * First boot after a clean install: the firmware formats its file system before it answers.
   * ⚠️ Placeholder until measured on a Heltec V4 (vault: mesh-flasher-member-flow-fixes-2026-11-05).
   */
  firstBoot: 90,
  /** Save + reboot after setup, then the port comes back. */
  save: 10,
  /** The whole verify window: VERIFY_ATTEMPTS × (pause + read). */
  verify: 6 * (3 + 20) + 2,
} as const

const VERIFY_ATTEMPTS = 6

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

const state = reactive({
  step: 'loading' as Step,
  site: null as api.Site | null,
  gate: null as GateResult | null,
  me: null as api.Me | null,
  cfg: null as api.ConfigResponse | null,
  port: null as SerialPort | null,
  snapshot: null as Snapshot | null,
  boardId: '' as string,
  refusedLabel: '',
  needsInstall: false,
  /** The check ran at least once and decided whether an install is needed. */
  checked: false,
  /** The silent-radio screen: true when we got there right after installing the software. */
  afterInstall: false,
  /** Ready screen: the radio's software is newer than the pinned version (still fine). */
  readyNewer: false,
  dfuReady: false,
  installPhase: '' as '' | 'download' | FlashPhase | 'firstboot',
  installPercent: 0,
  /** Date.now() when the current install phase began (for the write-time estimate). */
  phaseStartedAt: 0,
  /** The countdown for the wait the member is looking at, or null when there is none. */
  wait: null as Countdown | null,
  /** Which part of setup/verify is waiting: saving = commit + reboot; verify = read-back window. */
  waitPhase: '' as '' | 'saving' | 'verify',
  busy: false,
  error: '',
  /** Soft hint under the Pick button (e.g. the picker showed no radio). Not an error. */
  pickerNote: '',
  signinNote: '',
  longName: '',
  shortName: '',
  shortEdited: false,
  plan: null as Plan | null,
  steps: [] as PlanStep[],
  stepStates: {} as Record<string, StepState>,
  fields: [] as FieldResult[],
  verifyOk: false,
  nodeId: '',
  uplink: null as null | { seen: boolean, error: string | null },
  uplinkBusy: false,
})

function setError(e: unknown, fallback = 'Something went wrong.') {
  state.error = e instanceof Error && e.message ? e.message : fallback
}

function setPhase(p: typeof state.installPhase) {
  state.installPhase = p
  state.phaseStartedAt = Date.now()
  state.wait = p === 'connect'
    ? startCountdown(WAIT.connect)
    : p === 'erase'
      ? startCountdown(WAIT.erase)
      : p === 'reset'
        ? startCountdown(WAIT.reset)
        : p === 'firstboot'
          ? startCountdown(WAIT.firstBoot)
          : null
}

/** Ask Chrome for a radio. Returns null when the member closed the picker (and leaves a hint). */
async function askForPort(): Promise<SerialPort | null> {
  state.pickerNote = ''
  try {
    // Must run straight from the click (user gesture). The vendor filter keeps Bluetooth and
    // virtual ports out of the list — the usual wrong pick on a Mac.
    return await navigator.serial.requestPort({ filters: RADIO_USB_FILTERS })
  }
  catch (e) {
    if ((e as { name?: string })?.name === 'NotFoundError') {
      state.pickerNote = 'No radio in the list? Make sure the cable is a data cable — charging-only cables look the same — and try another USB port.'
      return null
    }
    setError(e, 'Could not open the radio picker.')
    return null
  }
}

/** Try the known port, then every granted port; return the first that opens (and close it again). */
async function findOpenablePort(prev: SerialPort | null): Promise<SerialPort | null> {
  const candidates: SerialPort[] = []
  if (prev) candidates.push(prev)
  try {
    for (const p of await navigator.serial.getPorts()) if (!candidates.includes(p)) candidates.push(p)
  }
  catch { /* no permission API: fall back to prev only */ }
  for (const p of candidates) {
    try {
      await openPortWithRetry(p, 115200, 1, 0)
      try {
        await p.close()
      }
      catch { /* ignore */ }
      return p
    }
    catch { /* next */ }
  }
  return null
}

export function useSetup() {
  const boards = computed(() => Object.keys(state.cfg?.firmware.boards ?? {}))
  const board = computed(() => state.cfg?.firmware.boards[state.boardId])
  const helpContact = computed(() => state.site?.helpContact || 'the person who sent you the radio')
  const groupName = computed(() => state.site?.group.name || 'Your group')
  /** For the step strip: Install is crossed out once the check said the radio is already current. */
  const installSkipped = computed(() => state.checked && !state.needsInstall)

  function go(step: Step) {
    state.step = step
    state.error = ''
  }

  async function init() {
    state.gate = detectGate({
      hasSerial: 'serial' in navigator,
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
    })
    const q = new URLSearchParams(location.search)
    const signin = q.get('signin')
    if (signin) {
      state.signinNote = signin === 'cancelled'
        ? 'Sign-in was cancelled. Press the button to try again.'
        : `Sign-in did not work${q.get('why') ? `: ${q.get('why')}` : ''}. Try again.`
      history.replaceState(null, '', location.pathname)
    }
    const preview = q.get('preview')
    if (preview && useRuntimeConfig().public.preview) {
      // Screenshot mode for a local build only (see nuxt.config.ts): fake state, no radio.
      const { applyPreview } = await import('~/utils/preview')
      applyPreview(state, preview)
      return
    }
    try {
      state.site = await api.getSite()
      document.title = `${state.site.group.name} radio setup`
    }
    catch (e) {
      setError(e, 'Could not load this page\'s settings.')
    }
    if (!state.gate.ok) return go('gate')
    if (!state.site) return go('signin')
    if (state.site.signedIn) return afterSignIn()
    go('signin')
  }

  async function afterSignIn() {
    state.busy = true
    try {
      state.me ??= await api.getMe()
      state.cfg = await api.getConfig()
      if (!state.longName) {
        state.longName = state.me.suggestedName
        state.shortName = suggestShortName(state.longName)
      }
      go('plug')
    }
    catch (e) {
      if (e instanceof api.ApiError && e.status === 401) { state.me = null; go('signin'); state.error = e.message }
      else { go('signin'); setError(e) }
    }
    finally { state.busy = false }
  }

  async function signInZulip(email: string, password: string) {
    state.busy = true
    state.error = ''
    try {
      state.me = await api.loginZulip(email.trim(), password)
      await afterSignIn()
    }
    catch (e) { setError(e, 'Sign-in did not work.') }
    finally { state.busy = false }
  }

  function signInMatrix() {
    location.href = '/api/login/matrix'
  }

  // --- plug in / check -------------------------------------------------------------------

  async function pickRadio() {
    state.error = ''
    const port = await askForPort()
    if (!port) return
    state.port = port
    state.afterInstall = false
    await checkRadio()
  }

  /** Act on what the check found. Only 'install' and 'silent' can lead to the install screen. */
  function applyRoute(route: CheckRoute) {
    state.checked = route.kind !== 'silent'
    switch (route.kind) {
      case 'silent':
        state.needsInstall = false
        return go('noanswer')
      case 'refused':
        state.refusedLabel = route.label
        return go('refused')
      case 'install':
        state.boardId = route.boardId
        state.needsInstall = true
        state.dfuReady = false
        return go('install')
      case 'ready':
        state.boardId = route.boardId
        state.needsInstall = false
        state.readyNewer = route.newer
        return go('ready')
    }
  }

  /** Ready screen: yes → on to the name. */
  function applyConfig() {
    go('name')
  }

  /** Ready screen: no → back to the start, nothing written. */
  function leaveRadio() {
    state.checked = false
    go('plug')
    state.pickerNote = 'Nothing was changed on the radio. You can unplug it.'
  }

  async function checkRadio() {
    if (!state.port || !state.cfg) return go('plug')
    go('check')
    state.snapshot = null
    state.boardId = ''
    state.wait = startCountdown(WAIT.check)
    try {
      const { session, snapshot } = await openAndRead(state.port, WAIT.check * 1000, { stopAt: 'metadata' })
      await session.close()
      state.snapshot = snapshot
      applyRoute(routeAfterRead(snapshot, state.cfg.firmware.boards, state.cfg.firmware.version))
    }
    catch (e) {
      if (e instanceof SetupError && e.stepId === 'read') {
        // Timed out — but route on whatever the radio did say. Silent only if it said nothing.
        const partial = e.cause as Snapshot | undefined
        state.snapshot = partial ?? null
        return applyRoute(routeAfterRead(partial, state.cfg.firmware.boards, state.cfg.firmware.version))
      }
      go('plug')
      setError(e, 'Could not open the radio. Unplug it, plug it in again, and try again.')
    }
    finally { state.wait = null }
  }

  /** From the silent-radio screen: the member says it is a brand-new radio with no software. */
  function installAnyway() {
    state.needsInstall = true
    state.dfuReady = false
    if (boards.value.length === 1) state.boardId = boards.value[0]!
    go('install')
  }

  // --- install ---------------------------------------------------------------------------

  async function installSoftware() {
    const cfg = state.cfg
    if (!cfg || !state.port) return go('plug')
    const bd = cfg.firmware.boards[state.boardId]
    if (!bd) { state.error = 'Pick which radio you have first.'; return }
    // Pick the port again, straight from this click: putting the radio in install mode (PRG +
    // RST) resets its USB, so on native-USB boards the port picked earlier is a dead handle.
    // Upstream's flasher asks again for the same reason.
    state.error = ''
    const port = await askForPort()
    if (!port) return
    state.port = port
    state.busy = true
    state.error = ''
    state.installPercent = 0
    try {
      setPhase('download')
      const images: Array<{ data: Uint8Array, address: number }> = []
      for (let i = 0; i < bd.clean.length; i++) {
        const e = bd.clean[i]!
        const data = await fetchVerified(cfg.firmware, e.name, f => (state.installPercent = Math.round(((i + f) / bd.clean.length) * 5)))
        images.push({ data, address: parseAddress(e.address) })
      }
      // Every file is downloaded and hash-checked before anything is written.
      await flashImages({
        port: state.port,
        images,
        onPhase: p => setPhase(p),
        onProgress: p => (state.installPercent = 5 + Math.round(p * 0.95)),
      })
      state.needsInstall = false
      // First boot: the radio formats its file system before it talks. Wait for it here, with a
      // countdown, instead of sending the member back to "Pick your radio" to find out.
      setPhase('firstboot')
      const found = await waitForFirstBoot(state.port, WAIT.firstBoot * 1000)
      if (!found) {
        state.afterInstall = true
        return go('noanswer')
      }
      state.port = found.port
      state.snapshot = found.snapshot
      state.checked = true
      // Freshly installed by us: no need to ask, the member came here to set it up.
      go('name')
    }
    catch (e) {
      state.installPercent = 0
      if (e instanceof FirmwareError) state.error = e.message
      else setError(e, 'Installing the software did not work.')
      if (e instanceof FirmwareError && e.kind === 'connect') state.dfuReady = false
    }
    finally {
      state.busy = false
      state.installPhase = ''
      state.wait = null
    }
  }

  /**
   * Poll until the radio answers a handshake after a fresh install, or the deadline passes.
   * Tries the same port object first, then any granted port (native USB re-enumerates).
   */
  async function waitForFirstBoot(prev: SerialPort, limitMs: number): Promise<{ port: SerialPort, snapshot: Snapshot } | null> {
    const deadline = Date.now() + limitMs
    await sleep(2000)
    while (Date.now() < deadline) {
      const port = await findOpenablePort(prev)
      if (port) {
        try {
          const left = Math.max(3000, Math.min(10000, deadline - Date.now()))
          const { session, snapshot } = await openAndRead(port, left, { stopAt: 'metadata' })
          await session.close()
          return { port, snapshot }
        }
        catch { /* not talking yet */ }
      }
      await sleep(3000)
    }
    return null
  }

  // --- name ------------------------------------------------------------------------------

  function setLongName(v: string) {
    state.longName = v
    if (!state.shortEdited) state.shortName = suggestShortName(v)
  }
  function setShortName(v: string) {
    state.shortEdited = true
    state.shortName = v.toUpperCase()
  }
  const nameCheck = computed(() => checkNames(state.longName, state.shortName))

  // --- set up + verify -------------------------------------------------------------------

  async function setupRadio() {
    const cfg = state.cfg
    if (!cfg || !state.port) return go('plug')
    if (!nameCheck.value.ok) { state.error = nameCheck.value.problem || ''; return }
    go('setup')
    state.busy = true
    state.stepStates = {}
    state.plan = null
    state.steps = []
    state.waitPhase = ''
    state.wait = null
    let session: Awaited<ReturnType<typeof openSession>> | null = null
    try {
      const opened = await openAndRead(state.port, 15000)
      session = opened.session
      const plan = buildPlan(cfg.config, { longName: state.longName, shortName: state.shortName }, opened.snapshot)
      state.plan = plan
      state.steps = planSteps(plan)
      await applyPlan(session.device, plan, (id, s) => { state.stepStates = { ...state.stepStates, [id]: s } })
      // The radio reboots now; give it a moment to drop the connection, then let go.
      state.waitPhase = 'saving'
      state.wait = startCountdown(WAIT.save)
      await Promise.race([session.closed, sleep(6000)])
      await session.close()
      session = null
      state.busy = false
      await verifyRadio()
    }
    catch (e) {
      if (session) { try { await session.close() } catch { /* ignore */ } }
      state.busy = false
      state.wait = null
      state.waitPhase = ''
      const where = e instanceof SetupError && e.stepId ? ` (stopped at: ${state.steps.find(s => s.id === e.stepId)?.label ?? e.stepId})` : ''
      state.error = (e instanceof Error ? e.message : 'Setting up the radio did not work.') + where
    }
  }

  async function verifyRadio() {
    if (!state.plan || !state.port) return go('plug')
    go('verify')
    state.busy = true
    state.fields = []
    state.waitPhase = 'verify'
    state.wait = startCountdown(WAIT.verify)
    try {
      let snap: Snapshot | null = null
      let lastErr: unknown
      for (let attempt = 0; attempt < VERIFY_ATTEMPTS && !snap; attempt++) {
        await sleep(3000)
        try {
          const session = await openSession(state.port)
          try { snap = await readDevice(session.device, 20000) }
          finally { await session.close() }
        }
        catch (e) {
          lastErr = e
          // The radio may have come back as a new port object.
          if (e instanceof SetupError) continue
          const p = await findOpenablePort(state.port)
          if (p) state.port = p
        }
      }
      if (!snap) throw lastErr ?? new Error('no answer')
      const res = compareSnapshot(state.plan, snap)
      state.fields = res.fields
      state.verifyOk = res.ok
      if (snap.myNodeNum !== undefined) state.nodeId = nodeIdFromNum(snap.myNodeNum)
      if (res.ok) go('done')
    }
    catch {
      state.error = 'Could not read the radio back. Unplug it, plug it in again, and press Check again.'
    }
    finally {
      state.busy = false
      state.wait = null
      state.waitPhase = ''
    }
  }

  const failedFields = computed(() => state.fields.filter(f => f.status === 'mismatch' || f.status === 'missing'))

  // --- done ------------------------------------------------------------------------------

  async function checkMesh() {
    if (!state.me || !state.nodeId) return
    state.uplinkBusy = true
    state.uplink = null
    try {
      const r = await api.checkUplink(state.nodeId, state.me.csrf)
      state.uplink = { seen: r.seen, error: r.error }
    }
    catch (e) {
      state.uplink = { seen: false, error: e instanceof Error ? e.message : 'Could not check.' }
    }
    finally { state.uplinkBusy = false }
  }

  // --- help ------------------------------------------------------------------------------

  /** Text for the "Stuck?" button: step + error + browser. Never includes keys or passwords. */
  function stuckText(): string {
    const bits = [
      `Radio setup problem (${groupName.value})`,
      `Step: ${STEP_NAMES[state.step]}${state.installPhase ? ` / ${state.installPhase}` : ''}${state.waitPhase ? ` / ${state.waitPhase}` : ''}`,
      `What it said: ${state.error || (failedFields.value.length ? 'Radio did not accept: ' + failedFields.value.map(f => f.label).join(', ') : 'nothing yet')}`,
      state.snapshot?.firmwareVersion ? `Radio software: ${state.snapshot.firmwareVersion}` : '',
      state.boardId ? `Radio: ${state.boardId}` : '',
      `Browser: ${navigator.userAgent}`,
    ]
    return bits.filter(Boolean).join('\n')
  }

  return {
    state, boards, board, helpContact, groupName, nameCheck, failedFields, installSkipped,
    go, init, signInZulip, signInMatrix, pickRadio, checkRadio, installAnyway, installSoftware, applyConfig, leaveRadio,
    setLongName, setShortName, setupRadio, verifyRadio, checkMesh, stuckText, afterSignIn,
  }
}
