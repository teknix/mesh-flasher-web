import { describe, it, expect } from 'vitest'
import { Protobuf, Types } from '@meshtastic/core'
import type { MeshDevice } from '@meshtastic/core'
import { create } from '@bufbuild/protobuf'
import { buildPlan, applyPlan, compareSnapshot, planSteps, readDevice, base64ToBytes, bytesToBase64, nodeIdFromNum, emptySnapshot, SetupError, type GroupConfig, type Snapshot } from './groupSetup'

const PSK0 = bytesToBase64(new Uint8Array(32).map((_, i) => i + 1))
const PSK1 = bytesToBase64(new Uint8Array(16).fill(7))

const config: GroupConfig = {
  lora: { region: 'US', modemPreset: 'LONG_FAST', hopLimit: 3, txPower: 0 },
  channels: [
    { index: 0, role: 'PRIMARY', name: 'BID', psk: PSK0, uplink: true, downlink: true, positionPrecision: 13 },
    { index: 1, role: 'SECONDARY', name: 'Side', psk: PSK1, uplink: true, downlink: false, positionPrecision: 0 },
  ],
  mqtt: { address: 'mesh.example.net', username: 'mesh-bid', password: 'hunter2-broker', tls: true, root: 'msh/BID', encryption: true, json: false, mapReporting: false },
  device: { role: 'CLIENT' },
}
const names = { longName: 'Dee Smith', shortName: 'DS' }

describe('base64', () => {
  it('round-trips bytes', () => {
    const b = new Uint8Array([0, 255, 128, 1])
    expect([...base64ToBytes(bytesToBase64(b))]).toEqual([...b])
    expect(base64ToBytes('').length).toBe(0)
  })
  it('formats node ids as 8 hex digits', () => {
    expect(nodeIdFromNum(0xf66f1e38)).toBe('!f66f1e38')
    expect(nodeIdFromNum(0x1234)).toBe('!00001234')
  })
})

describe('buildPlan', () => {
  const plan = buildPlan(config, names)

  it('builds LoRa config', () => {
    expect(plan.lora.payloadVariant.case).toBe('lora')
    const v = plan.lora.payloadVariant.value as Protobuf.Config.Config_LoRaConfig
    expect(v.region).toBe(Protobuf.Config.Config_LoRaConfig_RegionCode.US)
    expect(v.modemPreset).toBe(Protobuf.Config.Config_LoRaConfig_ModemPreset.LONG_FAST)
    expect(v.usePreset).toBe(true)
    expect(v.hopLimit).toBe(3)
    const slotted = buildPlan({ ...config, lora: { ...config.lora, channelNum: 20 } }, names)
    expect((slotted.lora.payloadVariant.value as Protobuf.Config.Config_LoRaConfig).channelNum).toBe(20)
    expect(v.txEnabled).toBe(true)
  })
  it('turns WiFi off and sets the role', () => {
    expect((plan.network.payloadVariant.value as Protobuf.Config.Config_NetworkConfig).wifiEnabled).toBe(false)
    expect((plan.device.payloadVariant.value as Protobuf.Config.Config_DeviceConfig).role).toBe(Protobuf.Config.Config_DeviceConfig_Role.CLIENT)
  })
  it('builds MQTT config with the phone bridge on', () => {
    const m = plan.mqtt.payloadVariant.value as Protobuf.ModuleConfig.ModuleConfig_MQTTConfig
    expect(m).toMatchObject({ enabled: true, address: 'mesh.example.net', username: 'mesh-bid', tlsEnabled: true, root: 'msh/BID', encryptionEnabled: true, jsonEnabled: false, proxyToClientEnabled: true, mapReportingEnabled: false })
    expect(m.password).toBe('hunter2-broker')
  })
  it('builds channels with psk bytes decoded from base64', () => {
    expect(plan.channels.filter(c => c.role !== Protobuf.Channel.Channel_Role.DISABLED)).toHaveLength(2)
    expect(plan.channels).toHaveLength(8) // slots 2..7 cleared
    const c0 = plan.channels[0]!
    expect(c0.role).toBe(Protobuf.Channel.Channel_Role.PRIMARY)
    expect(c0.settings!.psk).toBeInstanceOf(Uint8Array)
    expect([...c0.settings!.psk]).toEqual([...base64ToBytes(PSK0)])
    expect(c0.settings!.psk.length).toBe(32)
    expect(c0.settings!.name).toBe('BID')
    expect(c0.settings!.moduleSettings!.positionPrecision).toBe(13)
    const c1 = plan.channels[1]!
    expect(c1.role).toBe(Protobuf.Channel.Channel_Role.SECONDARY)
    expect(c1.settings!.downlinkEnabled).toBe(false)
    expect(c1.settings!.psk.length).toBe(16)
  })
  it('sets owner names', () => {
    expect(plan.owner.longName).toBe('Dee Smith')
    expect(plan.owner.shortName).toBe('DS')
  })
  it('keeps unrelated current settings when a base snapshot is given', () => {
    const snap = emptySnapshot()
    snap.lora = create(Protobuf.Config.Config_LoRaConfigSchema, { sx126xRxBoostedGain: true, channelNum: 5, region: 3 })
    const p = buildPlan(config, names, snap)
    const v = p.lora.payloadVariant.value as Protobuf.Config.Config_LoRaConfig
    expect(v.sx126xRxBoostedGain).toBe(true)
    expect(v.channelNum).toBe(5)
    expect(v.region).toBe(Protobuf.Config.Config_LoRaConfig_RegionCode.US) // ours wins
  })
  it('rejects unknown enum names', () => {
    expect(() => buildPlan({ ...config, lora: { ...config.lora, region: 'MARS' } }, names)).toThrow(SetupError)
  })
  it('lists steps in write order ending with the commit', () => {
    expect(planSteps(plan).map(s => s.id)).toEqual(['lora', 'network', 'device', 'mqtt', 'owner', 'channel-0', 'channel-1', 'channel-2', 'channel-3', 'channel-4', 'channel-5', 'channel-6', 'channel-7', 'commit'])
  })
})

// A snapshot that matches the plan exactly.
function matchingSnapshot(): Snapshot {
  const s = emptySnapshot()
  s.configured = true
  s.myNodeNum = 0xf66f1e38
  s.lora = create(Protobuf.Config.Config_LoRaConfigSchema, { usePreset: true, region: 1, modemPreset: 0, hopLimit: 3 })
  s.network = create(Protobuf.Config.Config_NetworkConfigSchema, { wifiEnabled: false })
  s.device = create(Protobuf.Config.Config_DeviceConfigSchema, { role: 0 })
  s.mqtt = create(Protobuf.ModuleConfig.ModuleConfig_MQTTConfigSchema, { enabled: true, address: 'mesh.example.net', username: 'mesh-bid', password: 'hunter2-broker', root: 'msh/BID', tlsEnabled: true, jsonEnabled: false, encryptionEnabled: true, proxyToClientEnabled: true, mapReportingEnabled: false })
  s.owner = { longName: 'Dee Smith', shortName: 'DS' }
  for (const ch of config.channels) {
    s.channels[ch.index] = create(Protobuf.Channel.ChannelSchema, { index: ch.index, role: ch.role === 'PRIMARY' ? 1 : 2, settings: { name: ch.name, psk: base64ToBytes(ch.psk), uplinkEnabled: ch.uplink, downlinkEnabled: ch.downlink } })
  }
  return s
}

describe('compareSnapshot', () => {
  const plan = buildPlan(config, names)

  it('passes when everything matches', () => {
    const r = compareSnapshot(plan, matchingSnapshot())
    expect(r.fields.filter(f => f.status !== 'ok')).toEqual([])
    expect(r.ok).toBe(true)
  })
  it('flags a wrong region and WiFi on', () => {
    const s = matchingSnapshot()
    s.lora = create(Protobuf.Config.Config_LoRaConfigSchema, { ...s.lora, region: 3 })
    s.network = create(Protobuf.Config.Config_NetworkConfigSchema, { wifiEnabled: true })
    const r = compareSnapshot(plan, s)
    expect(r.ok).toBe(false)
    expect(r.fields.filter(f => f.status === 'mismatch').map(f => f.id).sort()).toEqual(['lora.region', 'network.wifiEnabled'])
  })
  it('flags a missing channel and wrong channel name', () => {
    const s = matchingSnapshot()
    delete s.channels[1]
    s.channels[0] = create(Protobuf.Channel.ChannelSchema, { ...s.channels[0], settings: { ...s.channels[0]!.settings, name: 'OOPS' } })
    const r = compareSnapshot(plan, s)
    expect(r.fields.find(f => f.id === 'channel.0.name')!.status).toBe('mismatch')
    expect(r.fields.find(f => f.id === 'channel.1.name')!.status).toBe('missing')
    expect(r.ok).toBe(false)
  })
  it('treats withheld secrets as unreadable, not failures', () => {
    const s = matchingSnapshot()
    s.mqtt = create(Protobuf.ModuleConfig.ModuleConfig_MQTTConfigSchema, { ...s.mqtt, password: '' })
    s.channels[0] = create(Protobuf.Channel.ChannelSchema, { ...s.channels[0], settings: { ...s.channels[0]!.settings, psk: new Uint8Array(0) } })
    const r = compareSnapshot(plan, s)
    expect(r.fields.find(f => f.id === 'mqtt.password')!.status).toBe('unreadable')
    expect(r.fields.find(f => f.id === 'channel.0.psk')!.status).toBe('unreadable')
    expect(r.ok).toBe(true)
  })
  it('flags a wrong secret as mismatch but never returns secret values', () => {
    const s = matchingSnapshot()
    s.mqtt = create(Protobuf.ModuleConfig.ModuleConfig_MQTTConfigSchema, { ...s.mqtt, password: 'other' })
    const r = compareSnapshot(plan, s)
    expect(r.ok).toBe(false)
    const json = JSON.stringify(r.fields)
    expect(json).not.toContain('hunter2-broker')
    expect(json).not.toContain('other')
    expect(json).not.toContain(PSK0)
    expect(json).not.toContain(PSK1)
  })
})

// --- fake device ------------------------------------------------------------------------

class Dispatcher<T> {
  fns: Array<(v: T) => void> = []
  subscribe(fn: (v: T) => void) { this.fns.push(fn); return () => { this.fns = this.fns.filter(f => f !== fn) } }
  emit(v: T) { for (const f of [...this.fns]) f(v) }
}

function fakeDevice(opts: { commitHangs?: boolean, failOn?: string } = {}) {
  const calls: string[] = []
  const events = {
    onDeviceStatus: new Dispatcher<number>(),
    onMyNodeInfo: new Dispatcher<Protobuf.Mesh.MyNodeInfo>(),
    onDeviceMetadataPacket: new Dispatcher<{ data: Protobuf.Mesh.DeviceMetadata }>(),
    onConfigPacket: new Dispatcher<Protobuf.Config.Config>(),
    onModuleConfigPacket: new Dispatcher<Protobuf.ModuleConfig.ModuleConfig>(),
    onChannelPacket: new Dispatcher<Protobuf.Channel.Channel>(),
    onNodeInfoPacket: new Dispatcher<Protobuf.Mesh.NodeInfo>(),
  }
  const step = (name: string) => async () => {
    calls.push(name)
    if (opts.failOn === name) throw new Error('nope')
    return 1
  }
  const device = {
    events,
    setConfig: async (c: Protobuf.Config.Config) => { await step('setConfig:' + c.payloadVariant.case)() },
    setModuleConfig: async (c: Protobuf.ModuleConfig.ModuleConfig) => { await step('setModuleConfig:' + c.payloadVariant.case)() },
    setOwner: step('setOwner'),
    setChannel: async (c: Protobuf.Channel.Channel) => { await step('setChannel:' + c.index)() },
    commitEditSettings: () => { calls.push('commit'); return opts.commitHangs ? new Promise<number>(() => {}) : Promise.resolve(1) },
    configure: () => {
      calls.push('configure')
      // Replay a matching handshake, then DeviceConfigured.
      queueMicrotask(() => {
        const s = matchingSnapshot()
        events.onMyNodeInfo.emit(create(Protobuf.Mesh.MyNodeInfoSchema, { myNodeNum: s.myNodeNum, pioEnv: 'heltec-v4' }))
        events.onDeviceMetadataPacket.emit({ data: create(Protobuf.Mesh.DeviceMetadataSchema, { firmwareVersion: '2.7.26.54e0d8d', hwModel: 110 }) })
        events.onConfigPacket.emit(create(Protobuf.Config.ConfigSchema, { payloadVariant: { case: 'lora', value: s.lora! } }))
        events.onConfigPacket.emit(create(Protobuf.Config.ConfigSchema, { payloadVariant: { case: 'network', value: s.network! } }))
        events.onConfigPacket.emit(create(Protobuf.Config.ConfigSchema, { payloadVariant: { case: 'device', value: s.device! } }))
        events.onModuleConfigPacket.emit(create(Protobuf.ModuleConfig.ModuleConfigSchema, { payloadVariant: { case: 'mqtt', value: s.mqtt! } }))
        for (const ch of Object.values(s.channels)) events.onChannelPacket.emit(ch)
        events.onNodeInfoPacket.emit(create(Protobuf.Mesh.NodeInfoSchema, { num: s.myNodeNum, user: { longName: 'Dee Smith', shortName: 'DS' } }))
        events.onDeviceStatus.emit(Types.DeviceStatusEnum.DeviceConfigured)
      })
      return Promise.reject(new Error('never acked'))
    },
  }
  return { device: device as unknown as MeshDevice, calls, events }
}

describe('applyPlan', () => {
  const plan = buildPlan(config, names)

  it('writes in the required order, setConfig first, commit last', async () => {
    const { device, calls } = fakeDevice()
    const seen: string[] = []
    const res = await applyPlan(device, plan, (id, s) => { if (s === 'done') seen.push(id) })
    expect(calls).toEqual(['setConfig:lora', 'setConfig:network', 'setConfig:device', 'setModuleConfig:mqtt', 'setOwner', 'setChannel:0', 'setChannel:1', 'setChannel:2', 'setChannel:3', 'setChannel:4', 'setChannel:5', 'setChannel:6', 'setChannel:7', 'commit'])
    expect(seen).toEqual(['lora', 'network', 'device', 'mqtt', 'owner', 'channel-0', 'channel-1', 'channel-2', 'channel-3', 'channel-4', 'channel-5', 'channel-6', 'channel-7', 'commit'])
    expect(res.commit).toBe('acked')
  })
  it('stops at the failing step and names it', async () => {
    const { device, calls } = fakeDevice({ failOn: 'setOwner' })
    await expect(applyPlan(device, plan)).rejects.toMatchObject({ stepId: 'owner' })
    expect(calls).not.toContain('commit')
  })
  it('treats a commit that never answers (radio reboot) as unconfirmed, not failed', async () => {
    const { device } = fakeDevice({ commitHangs: true })
    const orig = globalThis.setTimeout
    // shorten the 15 s commit wait for the test
    globalThis.setTimeout = ((fn: () => void, ms?: number) => orig(fn, ms === 15000 ? 20 : ms)) as typeof setTimeout
    try {
      const res = await applyPlan(device, plan)
      expect(res.commit).toBe('unconfirmed')
    }
    finally { globalThis.setTimeout = orig }
  })
})

describe('readDevice', () => {
  it('collects the handshake and does not wait on configure()', async () => {
    const { device, calls } = fakeDevice()
    const snap = await readDevice(device, 1000)
    expect(calls).toEqual(['configure'])
    expect(snap).toMatchObject({ configured: true, pioEnv: 'heltec-v4', hwModel: 110, firmwareVersion: '2.7.26.54e0d8d', myNodeNum: 0xf66f1e38 })
    expect(snap.owner).toEqual({ longName: 'Dee Smith', shortName: 'DS' })
    expect(compareSnapshot(buildPlan(config, names), snap).ok).toBe(true)
  })
  it('times out with a SetupError carrying the partial snapshot', async () => {
    const { device, events } = fakeDevice()
    ;(device as unknown as { configure: () => Promise<number> }).configure = () => Promise.reject(new Error('x'))
    void events
    await expect(readDevice(device, 30)).rejects.toMatchObject({ name: 'SetupError', stepId: 'read' })
  })
})

describe('unused channel slots', () => {
  it('clears slots 1..7 the group does not define, skipping ones already disabled', () => {
    const snap = emptySnapshot()
    snap.channels[1] = create(Protobuf.Channel.ChannelSchema, { index: 1, role: Protobuf.Channel.Channel_Role.SECONDARY, settings: { name: 'Old' } })
    snap.channels[2] = create(Protobuf.Channel.ChannelSchema, { index: 2, role: Protobuf.Channel.Channel_Role.DISABLED })
    const plan = buildPlan(config, names, snap)
    const disabled = plan.channels.filter(c => c.role === Protobuf.Channel.Channel_Role.DISABLED).map(c => c.index)
    expect(disabled).toEqual([3, 4, 5, 6, 7]) // the fixture defines slots 0 and 1; slot 2 is already disabled
    expect(plan.expect.find(e => e.id === 'channel.1.cleared')).toBeTruthy()
    expect(plan.expect.find(e => e.id === 'channel.2.cleared')).toBeUndefined()
    const noBase = buildPlan(config, names)
    expect(noBase.channels.filter(c => c.role === Protobuf.Channel.Channel_Role.DISABLED).length).toBe(6)
  })
})
