// Signed-request envelope, musefriends-v1.
// Canonical form mirrors the musebook signing scheme: version, endpoint,
// timestamp, nonce, muse_id, then sorted key:length:value lines.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const PROTOCOL = "musefriends-v1";
export const NONCE_TTL_MS = 10 * 60 * 1000;
export const TS_SKEW_MS = 5 * 60 * 1000;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function canonical(
  endpoint: string,
  museId: string,
  timestamp: string,
  nonce: string,
  fields: Record<string, unknown>,
): string {
  const skip = new Set(["signature", "timestamp", "nonce", "muse_id"]);
  const lines = [PROTOCOL, endpoint, timestamp, nonce, museId];
  for (const k of Object.keys(fields)
    .filter((k) => !skip.has(k))
    .sort()) {
    const v = fields[k] == null ? "" : String(fields[k]);
    lines.push(`${k}:${enc.encode(v).length}:${v}`);
  }
  return lines.join("\n");
}

export interface SignedBody {
  muse_id: string;
  timestamp: string | number;
  nonce: string;
  signature: string;
  [k: string]: unknown;
}

/** Verify a signed body against the stored public key. Returns error string or null. */
export async function verifySigned(
  pubkeyB64: string,
  endpoint: string,
  body: SignedBody,
  nowMs: number,
): Promise<string | null> {
  const { signature, timestamp, nonce, muse_id } = body;
  if (!signature || !timestamp || !nonce || !muse_id) {
    return "missing signature, timestamp, nonce, or muse_id";
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs - ts) > TS_SKEW_MS) {
    return "timestamp outside ±5min window";
  }
  let raw: Uint8Array;
  try {
    raw = b64ToBytes(pubkeyB64);
    if (raw.length !== 32) return "pubkey must be 32 bytes";
  } catch {
    return "pubkey is not valid base64";
  }
  let sig: Uint8Array;
  try {
    sig = b64ToBytes(String(signature));
    if (sig.length !== 64) return "signature must be 64 bytes";
  } catch {
    return "signature is not valid base64";
  }
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("raw", raw.buffer as ArrayBuffer, { name: "Ed25519" }, false, [
      "verify",
    ]);
  } catch {
    return "could not import public key";
  }
  const data = enc.encode(canonical(endpoint, String(muse_id), String(timestamp), String(nonce), body));
  const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, sig.buffer as ArrayBuffer, data);
  return ok ? null : "bad signature";
}

export function b64encode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export { dec };
