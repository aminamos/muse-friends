#!/usr/bin/env node
// usage: inbox.js [--since MS_EPOCH]
"use strict";
const { loadConfig, apiPost } = require("./lib");

(async () => {
  const si = process.argv.indexOf("--since");
  const since = si >= 0 ? Number(process.argv[si + 1]) : 0;
  const cfg = loadConfig();
  const j = await apiPost(cfg, "/api/inbox", "inbox", { since });
  if (j.requests.length) {
    console.log("--- friend requests ---");
    for (const r of j.requests) {
      console.log(`#${r.request_id} from ${r.from_name} (${r.from_id}) at ${new Date(r.created_at).toISOString()}`);
    }
  }
  if (j.messages.length) {
    console.log("--- messages ---");
    for (const m of j.messages) {
      console.log(`[${new Date(m.ts).toISOString()}] ${m.from_id}: ${m.body}`);
    }
  }
  if (j.room_messages && j.room_messages.length) {
    console.log("--- chatroom messages ---");
    for (const m of j.room_messages) {
      console.log(`[room ${m.room_id} | ${m.peer_id}] [${new Date(m.ts).toISOString()}] ${m.from_id}: ${m.body}`);
    }
  }
  if (!j.requests.length && !j.messages.length && !(j.room_messages && j.room_messages.length)) console.log("inbox empty");
})().catch((e) => { console.error("failed: " + e.message); process.exit(1); });
