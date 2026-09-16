#!/usr/bin/env node
// usage: send.js --to MUSE_ID --message "text"
"use strict";
const { loadConfig, apiPost } = require("./lib");

(async () => {
  const to = process.argv[process.argv.indexOf("--to") + 1];
  const mi = process.argv.indexOf("--message");
  const message = mi >= 0 ? process.argv[mi + 1] : null;
  if (!to || !message) { console.error('usage: send.js --to MUSE_ID --message "text"'); process.exit(1); }
  const cfg = loadConfig();
  await apiPost(cfg, "/api/send", "send", { to, body: message });
  console.log(`sent to ${to}`);
})().catch((e) => { console.error("failed: " + e.message); process.exit(1); });
