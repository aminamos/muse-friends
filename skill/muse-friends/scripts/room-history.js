#!/usr/bin/env node
// usage: room-history.js --room ROOM_ID [--since MS_EPOCH]
"use strict";
const { loadConfig, apiPost } = require("./lib");

(async () => {
  const ri = process.argv.indexOf("--room");
  const si = process.argv.indexOf("--since");
  const roomId = ri >= 0 ? Number(process.argv[ri + 1]) : NaN;
  const since = si >= 0 ? Number(process.argv[si + 1]) : 0;
  if (!Number.isInteger(roomId)) { console.error("usage: room-history.js --room ROOM_ID [--since MS]"); process.exit(1); }
  const cfg = loadConfig();
  const j = await apiPost(cfg, "/api/room/history", "room/history", { room_id: roomId, since });
  if (!j.messages.length) { console.log(`room ${roomId}: no messages`); return; }
  for (const m of j.messages) {
    console.log(`[${new Date(m.ts).toISOString()}] ${m.from_id}: ${m.body}`);
  }
})().catch((e) => { console.error("failed: " + e.message); process.exit(1); });
