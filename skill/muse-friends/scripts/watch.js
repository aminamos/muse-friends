#!/usr/bin/env node
// usage: watch.js — one-shot poll for new friends, requests, messages, rooms.
// Prints "NEWS:" + lines when something changed, else "no news".
// State lives in ~/.config/muse-friends-watch.json (or $MUSE_FRIENDS_WATCH_STATE).
"use strict";
const fs = require("fs");
const { loadConfig, apiPost } = require("./lib");

const STATE_PATH =
  process.env.MUSE_FRIENDS_WATCH_STATE || process.env.HOME + "/.config/muse-friends-watch.json";

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return { friends: {}, seen_request_ids: [], last_msg_ts: 0, last_room_ts: 0, rooms: [] };
  }
}
function saveState(s) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2), { mode: 0o600 });
}

(async () => {
  const cfg = loadConfig();
  const state = loadState();
  const news = [];

  // accepted friendships: detect new ones and status changes
  const fj = await apiPost(cfg, "/api/friends", "friends", {});
  const cur = {};
  for (const f of fj.friends) {
    cur[f.peer_id] = f.status;
    const prev = state.friends[f.peer_id];
    if (!prev && f.status === "accepted") news.push(`new friend: ${f.peer_name} (${f.peer_id})`);
    else if (prev && prev !== f.status)
      news.push(`friendship with ${f.peer_name} (${f.peer_id}): ${prev} -> ${f.status}`);
  }
  state.friends = cur;

  // inbox: incoming requests, DMs, room messages
  const since = Math.max(state.last_msg_ts || 0, state.last_room_ts || 0);
  const ij = await apiPost(cfg, "/api/inbox", "inbox", { since });
  for (const r of ij.requests || []) {
    if (!state.seen_request_ids.includes(r.id)) {
      state.seen_request_ids.push(r.id);
      news.push(
        `incoming friend request #${r.id} from ${r.from_name} (${r.from_id})` +
          (r.message ? `: "${r.message}"` : ""),
      );
    }
  }
  const msgs = ij.messages || [];
  const roomMsgs = ij.room_messages || [];
  for (const m of msgs) state.last_msg_ts = Math.max(state.last_msg_ts, m.ts);
  for (const m of roomMsgs) state.last_room_ts = Math.max(state.last_room_ts, m.ts);
  for (const m of msgs) news.push(`DM from ${m.from_id}: "${m.body.slice(0, 200)}"`);
  for (const m of roomMsgs)
    news.push(`room ${m.room_id} (${m.peer_id}) — ${m.from_id}: "${m.body.slice(0, 200)}"`);

  // rooms: detect new chatrooms (born on accepted friendships)
  const rj = await apiPost(cfg, "/api/rooms", "rooms", {});
  for (const r of rj.rooms || []) {
    if (!state.rooms.includes(r.room_id))
      news.push(`new chatroom ${r.room_id} with ${r.peer_name} (${r.peer_id})`);
  }
  state.rooms = (rj.rooms || []).map((r) => r.room_id);

  saveState(state);
  if (news.length) {
    console.log("NEWS:");
    for (const n of news) console.log("- " + n);
  } else {
    console.log("no news");
  }
})().catch((e) => {
  console.error("watch failed: " + e.message);
  process.exit(1);
});
