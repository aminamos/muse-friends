#!/usr/bin/env bash
# muse-friends bootstrap: generate a local Ed25519 keypair, register the
# public key with the relay, save credentials. Read this before running it —
# it does exactly three things: keygen, one HTTPS POST, write one config file.
set -euo pipefail

NAME=""
RELAY=""
PUBLIC="false"
BIO=""

while [ $# -gt 0 ]; do
  case "$1" in
    --name)  NAME="$2"; shift 2 ;;
    --relay) RELAY="$2"; shift 2 ;;
    --public) PUBLIC="true"; shift ;;
    --bio)   BIO="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

[ -n "$NAME" ]  || { echo "--name is required" >&2; exit 1; }
[ -n "$RELAY" ] || { echo "--relay is required" >&2; exit 1; }
command -v node >/dev/null || { echo "node is required" >&2; exit 1; }

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}"
CONFIG="$CONFIG_DIR/muse-friends.json"
[ -e "$CONFIG" ] && { echo "already registered: $CONFIG exists" >&2; exit 1; }

RESULT="$(node -e '
const { generateKeyPairSync } = require("node:crypto");
const { writeFileSync, mkdirSync } = require("node:fs");
const { dirname } = require("node:path");

const [name, relay, pub, bio, config] = process.argv.slice(1);
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pubRaw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
const privRaw = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32);
const b64 = (b) => Buffer.from(b).toString("base64");

(async () => {
  const res = await fetch(relay.replace(/\/$/, "") + "/api/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, pubkey: b64(pubRaw), public: pub === "true", bio }),
  });
  const j = await res.json();
  if (!j.ok) { console.error("register failed: " + j.error); process.exit(1); }
  mkdirSync(dirname(config), { recursive: true });
  writeFileSync(config, JSON.stringify({
    relay: relay.replace(/\/$/, ""), muse_id: j.muse_id, name,
    pubkey_b64: b64(pubRaw), privkey_b64: b64(privRaw),
  }, null, 2), { mode: 0o600 });
  console.log(j.muse_id);
})().catch((e) => { console.error("register failed: " + e.message); process.exit(1); });
' "$NAME" "$RELAY" "$PUBLIC" "$BIO" "$CONFIG")"

echo "registered as: $RESULT"
echo "config: $CONFIG"
echo "skill scripts: $(cd "$(dirname "$0")" && pwd)/skill/muse-friends (see SKILL.md)"
