// The whole member flow as one small state machine. State lives in memory only: the group
// config (channel keys, MQTT password) is never put in storage, URLs or logs.
import { reactive, computed } from 'vue'
import * as api from '~/utils/api'
import { detectGate, type GateResult } from '~/utils/browserGate'
import { resolveBoard, suggestShortName, checkNames } from '~/utils/board'
import { openAndRead, openSession } from '~/utils/meshSession'
import { buildPlan, applyPlan, compareSnapshot, planSteps, readDevice, nodeIdFromNum, SetupError, type Plan, type PlanStep, type Snapshot, type StepState, type FieldResult } from '~/utils/groupSetup'
import { fetchVerified, flashImages, parseAddress, reacquirePort, FirmwareError, type FlashPhase } from '~/utils/espFlash'

export type Step = 'loading' | 'gate' | 'signin' | 'plug' | 'check' | 'refused' | 'install' | 'name' | 'setup' | 'verify' | 'done'

export const STEP_NAMES: Record<Step, string> = {
  loading: 'Loading',
  gate: 'Browser check',
  signin: 'Sign in',
  plug: 'Plug in the radio',
  check: 'Checking your radio',
  refused: 'Radio not supported',
  install: 'Installing the radio\'s software',
  name: 'Your name',
  setup: 'Setting up your radio',
  verify: 'Checking it took',
  done: 'Done',
}

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
  dfuReady: false,
  installPhase: '' as '' | 'download' | FlashPhase,
  installPercent: 0,
  busy: false,
  error: '',
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

export function useSetup() {
  const boards = computed(() => Object.keys(state.cfg?.firmware.boards ?? {}))
  const board = computed(() => state.cfg?.firmware.boards[state.boardId])
  const helpContact = computed(() => state.site?.helpContact || 'the person who sent you the radio')
  const groupName = computed(() => state.site?.group.name || 'Your group')

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
    try {
      // Must run straight from the click (user gesture). No port filter: boards differ.
      state.port = await navigator.serial.requestPort()
    }
    catch (e) {
      if ((e as { name?: string })?.name === 'NotFoundError') return // closed the picker
      return setError(e, 'Could not open the radio picker.')
    }
    await checkRadio()
  }

  async function checkRadio() {
    if (!state.port || !state.cfg) return go('plug')
    go('check')
    state.snapshot = null
    state.boardId = ''
    try {
      const { session, snapshot } = await openAndRead(state.port, 10000)
      await session.close()
      state.snapshot = snapshot
      const res = resolveBoard({ pioEnv: snapshot.pioEnv, hwModel: snapshot.hwModel }, state.cfg.firmware.boards)
      if (!res.supported) {
        state.refusedLabel = res.label
        return go('refused')
      }
      state.boardId = res.boardId!
      const pinned = (state.cfg.firmware.version || '').replace(/^v/, '')
      const have = (snapshot.firmwareVersion || '').replace(/^v/, '')
      state.needsInstall = !have || have !== pinned
      state.dfuReady = false
      go(state.needsInstall ? 'install' : 'name')
    }
    catch (e) {
      if (e instanceof SetupError && e.stepId === 'read') {
        // No answer: blank board or in installer mode. Go install; the board is chosen there.
        state.needsInstall = true
        state.dfuReady = false
        if (boards.value.length === 1) state.boardId = boards.value[0]!
        return go('install')
      }
      go('plug')
      setError(e, 'Could not open the radio. Unplug it, plug it in again, and try again.')
    }
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
    try {
      state.port = await navigator.serial.requestPort()
    }
    catch (e) {
      if ((e as { name?: string })?.name === 'NotFoundError') return // closed the picker
      return setError(e, 'Could not open the radio picker.')
    }
    state.busy = true
    state.error = ''
    state.installPercent = 0
    try {
      state.installPhase = 'download'
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
        onPhase: p => (state.installPhase = p),
        onProgress: p => (state.installPercent = 5 + Math.round(p * 0.95)),
      })
      state.installPhase = 'reset'
      const port = await reacquirePort(state.port)
      if (!port) {
        state.error = 'The software is installed. Tap the RST button once, or unplug the radio and plug it back in, then press Pick your radio.'
        state.needsInstall = false
        return go('plug')
      }
      state.port = port
      state.needsInstall = false
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
    }
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
    let session: Awaited<ReturnType<typeof openSession>> | null = null
    try {
      const opened = await openAndRead(state.port, 15000)
      session = opened.session
      const plan = buildPlan(cfg.config, { longName: state.longName, shortName: state.shortName }, opened.snapshot)
      state.plan = plan
      state.steps = planSteps(plan)
      await applyPlan(session.device, plan, (id, s) => { state.stepStates = { ...state.stepStates, [id]: s } })
      // The radio reboots now; give it a moment to drop the connection, then let go.
      await Promise.race([session.closed, sleep(6000)])
      await session.close()
      session = null
      state.busy = false
      await verifyRadio()
    }
    catch (e) {
      if (session) { try { await session.close() } catch { /* ignore */ } }
      state.busy = false
      const where = e instanceof SetupError && e.stepId ? ` (stopped at: ${state.steps.find(s => s.id === e.stepId)?.label ?? e.stepId})` : ''
      state.error = (e instanceof Error ? e.message : 'Setting up the radio did not work.') + where
    }
  }

  async function verifyRadio() {
    if (!state.plan || !state.port) return go('plug')
    go('verify')
    state.busy = true
    state.fields = []
    try {
      let snap: Snapshot | null = null
      let lastErr: unknown
      for (let attempt = 0; attempt < 6 && !snap; attempt++) {
        await sleep(attempt === 0 ? 3000 : 3000)
        try {
          const session = await openSession(state.port)
          try { snap = await readDevice(session.device, 20000) }
          finally { await session.close() }
        }
        catch (e) {
          lastErr = e
          // The radio may have come back as a new port object.
          if (e instanceof SetupError) continue
          try {
            const granted = await navigator.serial.getPorts()
            if (granted.length === 1) state.port = granted[0]!
          }
          catch { /* ignore */ }
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
    finally { state.busy = false }
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
      `Step: ${STEP_NAMES[state.step]}`,
      `What it said: ${state.error || (failedFields.value.length ? 'Radio did not accept: ' + failedFields.value.map(f => f.label).join(', ') : 'nothing yet')}`,
      state.snapshot?.firmwareVersion ? `Radio software: ${state.snapshot.firmwareVersion}` : '',
      state.boardId ? `Radio: ${state.boardId}` : '',
      `Browser: ${navigator.userAgent}`,
    ]
    return bits.filter(Boolean).join('\n')
  }

  return {
    state, boards, board, helpContact, groupName, nameCheck, failedFields,
    go, init, signInZulip, signInMatrix, pickRadio, checkRadio, installSoftware,
    setLongName, setShortName, setupRadio, verifyRadio, checkMesh, stuckText, afterSignIn,
  }
}
