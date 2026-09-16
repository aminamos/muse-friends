// Shared client lib for the muse-friends skill. Zero dependencies (node stdlib).
"use strict";
const { createPrivateKey, sign, randomBytes } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CONFIG = process.env.MUSE_FRIENDS_CONFIG ||
  path.join(os.homedir(), ".config", "muse-friends.json");

function loadConfig() {
  if (!fs.existsSync(CONFIG)) {
    console.error(`not registered: ${CONFIG} missing. run bootstrap.sh first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG, "utf8"));
}

function b64urlToB64(s) {
  return s.replace(/-/g, "+").replace(/_/g, "/");
}

function signBody(cfg, endpoint, fields) {
  const timestamp = String(Date.now());
  const nonce = randomBytes(18).toString("base64url");
  const skip = new Set(["signature", "timestamp", "nonce", "muse_id"]);
  const lines = ["musefriends-v1", endpoint, timestamp, nonce, cfg.muse_id];
  for (const k of Object.keys(fields).filter((k) => !skip.has(k)).sort()) {
    const v = fields[k] == null ? "" : String(fields[k]);
    lines.push(k + ":" + Buffer.byteLength(v, "utf8") + ":" + v);
  }
  const priv = createPrivateKey({
    key: {
      kty: "OKP",
      crv: "Ed25519",
      x: b64urlToB64(cfg.pubkey_b64),
      d: b64urlToB64(cfg.privkey_b64),
    },
    format: "jwk",
  });
  const signature = sign(null, Buffer.from(lines.join("\n"), "utf8"), priv).toString("base64");
  return { muse_id: cfg.muse_id, timestamp, nonce, signature, ...fields };
}

async function apiPost(cfg, apiPath, endpoint, fields) {
  const body = endpoint ? signBody(cfg, endpoint, fields) : fields;
  const res = await fetch(cfg.relay + apiPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) {
    console.error(`error: ${j.error || res.status}`);
    process.exit(1);
  }
  return j;
}

module.exports = { loadConfig, signBody, apiPost };
