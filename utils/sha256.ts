// SHA-256 helpers. Firmware is checked against the manifest hash BEFORE anything is written.

export function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const view = data instanceof Uint8Array ? data : new Uint8Array(data)
  // Copy into a fresh ArrayBuffer so SharedArrayBuffer-backed views are never passed in.
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(view))
  return toHex(new Uint8Array(digest))
}

export async function matchesSha256(data: ArrayBuffer | Uint8Array, expectedHex: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/i.test(expectedHex)) return false
  return (await sha256Hex(data)) === expectedHex.toLowerCase()
}
