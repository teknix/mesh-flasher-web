import { describe, it, expect } from 'vitest'
import { resolveBoard, suggestShortName, checkNames } from './board'

describe('suggestShortName', () => {
  it('uses initials for 2+ words', () => {
    expect(suggestShortName('Dee Smith')).toBe('DS')
    expect(suggestShortName('mary jane watson parker extra')).toBe('MJWP')
  })
  it('uses the first 4 letters for one word', () => {
    expect(suggestShortName('Dandelion')).toBe('DAND')
    expect(suggestShortName('ab')).toBe('AB')
  })
  it('ignores punctuation and handles empty', () => {
    expect(suggestShortName('  ')).toBe('')
    expect(suggestShortName('o\'neil-jones')).toBe('OJ')
  })
})

describe('checkNames', () => {
  it('accepts normal names', () => expect(checkNames('Dee', 'DEE').ok).toBe(true))
  it('rejects empty and over-long', () => {
    expect(checkNames('', 'AB').ok).toBe(false)
    expect(checkNames('x'.repeat(40), 'AB').ok).toBe(false)
    expect(checkNames('Dee', 'ABCDE').ok).toBe(false)
    expect(checkNames('Dee', '').ok).toBe(false)
  })
  it('counts bytes, not characters', () => {
    expect(checkNames('é'.repeat(20), 'AB').ok).toBe(false) // 40 bytes
  })
})

describe('resolveBoard', () => {
  const supported = ['heltec-v4']
  it('prefers pioEnv', () => {
    expect(resolveBoard({ pioEnv: 'heltec-v4', hwModel: 999 }, supported)).toMatchObject({ boardId: 'heltec-v4', supported: true })
  })
  it('falls back to hwModel 110', () => {
    expect(resolveBoard({ hwModel: 110 }, supported)).toMatchObject({ boardId: 'heltec-v4', supported: true })
  })
  it('refuses a known board the group does not support', () => {
    const r = resolveBoard({ hwModel: 43, pioEnv: 'heltec-v3' }, supported)
    expect(r.supported).toBe(false)
    expect(r.label).toBe('heltec-v3')
  })
  it('refuses unknown models and names them', () => {
    expect(resolveBoard({ hwModel: 7777 }, supported)).toMatchObject({ supported: false, label: 'model number 7777' })
    expect(resolveBoard({}, supported).supported).toBe(false)
  })
})
