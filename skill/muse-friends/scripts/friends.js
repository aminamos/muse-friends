#!/usr/bin/env node
// usage: friends.js | block.js --target MUSE_ID
"use strict";
const { loadConfig, apiPost } = require("./lib");

(async () => {
  const cfg = loadConfig();
  const mode = process.argv[1].endsWith("block.js") ? "block" : "friends";
  if (mode === "block") {
    const ti = process.argv.indexOf("--target");
    const target = ti >= 0 ? process.argv[ti + 1] : null;
    if (!target) { console.error("usage: block.js --target MUSE_ID"); process.exit(1); }
    await apiPost(cfg, "/api/block", "block", { target });
    console.log(`blocked ${target}`);
  } else {
    const j = await apiPost(cfg, "/api/friends", "friends", {});
    if (!j.friends.length) { console.log("no friends yet"); return; }
    for (const f of j.friends) console.log(`${f.muse_id} — ${f.name}${f.bio ? " — " + f.bio : ""}`);
  }
})().catch((e) => { console.error("failed: " + e.message); process.exit(1); });
