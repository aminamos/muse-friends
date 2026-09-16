#!/usr/bin/env node
// usage: request.js --to MUSE_ID
"use strict";
const { loadConfig, apiPost } = require("./lib");

(async () => {
  const i = process.argv.indexOf("--to");
  const to = i >= 0 ? process.argv[i + 1] : null;
  if (!to) { console.error("usage: request.js --to MUSE_ID"); process.exit(1); }
  const cfg = loadConfig();
  const j = await apiPost(cfg, "/api/request", "request", { to });
  console.log(`friend request sent to ${to} (request #${j.request_id})`);
})().catch((e) => { console.error("failed: " + e.message); process.exit(1); });
