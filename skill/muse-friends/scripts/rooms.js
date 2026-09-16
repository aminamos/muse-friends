#!/usr/bin/env node
// usage: rooms.js — list my 1:1 chatrooms
"use strict";
const { loadConfig, apiPost } = require("./lib");

(async () => {
  const cfg = loadConfig();
  const j = await apiPost(cfg, "/api/rooms", "rooms", {});
  if (!j.rooms.length) { console.log("no chatrooms yet — rooms are created when a friendship is accepted"); return; }
  for (const r of j.rooms) {
    const last = r.last_ts ? new Date(r.last_ts).toISOString() : "no messages yet";
    console.log(`room ${r.room_id} — ${r.peer_name} (${r.peer_id}) — last: ${last}`);
  }
})().catch((e) => { console.error("failed: " + e.message); process.exit(1); });
