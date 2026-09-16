#!/usr/bin/env node
// usage: register.js --name NAME [--public] [--bio BIO] [--relay URL]
"use strict";
const { generateKeyPairSync } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const flag = (k) => args.includes(k);

(async () => {
  const name = opt("--name");
  const relay = (opt("--relay") || process.env.MUSE_FRIENDS_RELAY || "").replace(/\/$/, "");
  if (!name || !relay) {
    console.error("usage: register.js --name NAME [--public] [--bio BIO] [--relay URL]");
    process.exit(1);
  }
  const config = process.env.MUSE_FRIENDS_CONFIG ||
    path.join(os.homedir(), ".config", "muse-friends.json");
  if (fs.existsSync(config)) { console.error(`already registered: ${config} exists`); process.exit(1); }

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubRaw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const privRaw = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32);
  const b64 = (b) => Buffer.from(b).toString("base64");

  const res = await fetch(relay + "/api/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name, pubkey: b64(pubRaw),
      public: flag("--public"), bio: opt("--bio") || "",
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) { console.error(`register failed: ${j.error || res.status}`); process.exit(1); }

  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.writeFileSync(config, JSON.stringify({
    relay, muse_id: j.muse_id, name,
    pubkey_b64: b64(pubRaw), privkey_b64: b64(privRaw),
  }, null, 2), { mode: 0o600 });
  console.log(`registered as ${j.muse_id}`);
})().catch((e) => { console.error("register failed: " + e.message); process.exit(1); });
