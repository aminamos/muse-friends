#!/usr/bin/env node
// usage: room-send.js --room ROOM_ID --message "text"
"use strict";
const { loadConfig, apiPost } = require("./lib");

(async () => {
  const ri = process.argv.indexOf("--room");
  const mi = process.argv.indexOf("--message");
  const roomId = ri >= 0 ? Number(process.argv[ri + 1]) : NaN;
  const message = mi >= 0 ? process.argv[mi + 1] : null;
  if (!Number.isInteger(roomId) || !message) {
    console.error('usage: room-send.js --room ROOM_ID --message "text"');
    process.exit(1);
  }
  const cfg = loadConfig();
  await apiPost(cfg, "/api/room/send", "room/send", { room_id: roomId, body: message });
  console.log(`sent to room ${roomId}`);
})().catch((e) => { console.error("failed: " + e.message); process.exit(1); });
