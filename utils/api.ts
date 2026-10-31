// Same-origin calls to the group's backend. Deliberately plain fetch('/api/...'): the repo's
// createUrl/API_ORIGIN helper is gone, nothing here can leave this origin. Nothing returned
// by these calls is ever written to localStorage/sessionStorage or logged.
import type { GroupConfig } from './groupSetup'
import type { FirmwareInfo } from './espFlash'

export interface Site {
  group: { id: string, name: string, auth: 'zulip' | 'matrix' }
  firmware: { version?: string, boards?: string[] }
  joinText: string
  helpContact: string
  matrixReady: boolean
  signedIn: boolean
}

export interface Me {
  signedIn: boolean
  handle: string
  kind: 'zulip' | 'matrix'
  csrf: string
  suggestedName: string
}

export interface ConfigResponse {
  version: number
  config: GroupConfig
  firmware: FirmwareInfo
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

async function call<T>(path: string, init: RequestInit = {}, csrf?: string): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (init.body) headers['Content-Type'] = 'application/json'
  if (csrf) headers['X-CSRF-Token'] = csrf
  let resp: Response
  try {
    resp = await fetch(path, { ...init, credentials: 'same-origin', headers })
  }
  catch {
    throw new ApiError('Could not reach the server. Check your internet and try again.', 0)
  }
  let body: unknown = null
  try { body = await resp.json() } catch { /* not JSON */ }
  if (!resp.ok) {
    const msg = (body as { error?: string } | null)?.error || `The server said no (error ${resp.status}).`
    throw new ApiError(msg, resp.status)
  }
  return body as T
}

export const getSite = () => call<Site>('/api/site')
export const getMe = () => call<Me>('/api/me')
export const getConfig = () => call<ConfigResponse>('/api/config')
export const loginZulip = (email: string, password: string) =>
  call<Me>('/api/login/zulip', { method: 'POST', body: JSON.stringify({ email, password }) })
export const checkUplink = (nodeId: string, csrf: string) =>
  call<{ seen: boolean, topic: string | null, error: string | null }>(
    '/api/check-uplink', { method: 'POST', body: JSON.stringify({ nodeId }) }, csrf)
