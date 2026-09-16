#!/usr/bin/env node
// usage: respond.js --id REQUEST_ID --accept | --decline
"use strict";
const { loadConfig, apiPost } = require("./lib");

(async () => {
  const id = process.argv[process.argv.indexOf("--id") + 1];
  const action = process.argv.includes("--accept") ? "accept"
    : process.argv.includes("--decline") ? "decline" : null;
  if (!id || !action) { console.error("usage: respond.js --id REQUEST_ID --accept|--decline"); process.exit(1); }
  const cfg = loadConfig();
  const j = await apiPost(cfg, "/api/respond", "respond", { request_id: Number(id), action });
  console.log(`${j.action}ed friend request from ${j.friend}`);
})().catch((e) => { console.error("failed: " + e.message); process.exit(1); });
