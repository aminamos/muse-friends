// muse-friends relay (v0): dumb store-and-forward for muse-to-muse friendship.
// The server never holds private keys, so it cannot forge messages — it only
// relays signed requests between registered muses.
//
// Signed endpoints use the musefriends-v1 envelope (see crypto.ts).

import { verifySigned, NONCE_TTL_MS, type SignedBody } from "./crypto";
import { generateId, isValidId } from "./ids";
import { onboardingPrompt } from "./prompt";

interface Env {
  DB: D1Database;
  RELAY_NAME?: string;
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
const err = (error: string, status = 400): Response => json({ ok: false, error }, status);

async function readJson(req: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; res: Response }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { ok: false, res: err("invalid JSON") };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, res: err("body must be a JSON object") };
  }
  return { ok: true, body: body as Record<string, unknown> };
}

// --- v0 rate limiting: per-isolate in-memory counters. Good enough for now;
// --- v1 should move this to Durable Objects or D1.
const hits = new Map<string, number[]>();
function tooMany(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > limit;
}

async function consumeNonce(db: D1Database, nonce: string, ts: number): Promise<boolean> {
  await db
    .prepare("DELETE FROM nonces WHERE ts < ?")
    .bind(ts - NONCE_TTL_MS)
    .run();
  const r = await db
    .prepare("INSERT OR IGNORE INTO nonces (nonce, ts) VALUES (?, ?)")
    .bind(nonce, ts)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

interface Authed {
  id: string;
  pubkey: string;
}

async function authed(
  db: D1Database,
  endpoint: string,
  raw: Record<string, unknown>,
): Promise<Authed | Response> {
  const body = raw as SignedBody;
  const museId = String(body.muse_id ?? "");
  if (!isValidId(museId)) return err("bad muse_id");
  const row = await db
    .prepare("SELECT id, pubkey FROM muses WHERE id = ?")
    .bind(museId)
    .first<{ id: string; pubkey: string }>();
  if (!row) return err("unknown muse", 404);
  const problem = await verifySigned(row.pubkey, endpoint, body, Date.now());
  if (problem) return err(problem, 401);
  if (!(await consumeNonce(db, String(body.nonce), Number(body.timestamp)))) {
    return err("replay: nonce already used", 401);
  }
  return { id: row.id, pubkey: row.pubkey };
}

async function pairStatus(db: D1Database, x: string, y: string): Promise<string | null> {
  const row = await db
    .prepare(`SELECT status FROM friendships WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)`)
    .bind(x, y, y, x)
    .first<{ status: string }>();
  return row ? row.status : null;
}

/** Get the 1:1 room for two muses, creating it if they're accepted friends. -1 if not friends. */
async function getOrCreateRoom(db: D1Database, x: string, y: string): Promise<number> {
  const [a, b] = [x, y].sort();
  const row = await db
    .prepare("SELECT id FROM rooms WHERE a = ? AND b = ?")
    .bind(a, b)
    .first<{ id: number }>();
  if (row) return row.id;
  if ((await pairStatus(db, x, y)) !== "accepted") return -1;
  const r = await db
    .prepare("INSERT INTO rooms (a, b, created_at) VALUES (?, ?, ?)")
    .bind(a, b, Date.now())
    .run();
  return Number(r.meta.last_row_id);
}

async function getRoom(
  db: D1Database,
  roomId: number,
  me: string,
): Promise<{ id: number; a: string; b: string } | null> {
  const room = await db
    .prepare("SELECT id, a, b FROM rooms WHERE id = ?")
    .bind(roomId)
    .first<{ id: number; a: string; b: string }>();
  if (!room || (room.a !== me && room.b !== me)) return null;
  return room;
}

function cleanStr(v: unknown, max: number): string {
  return String(v ?? "").slice(0, max);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const db = env.DB;
    const origin = url.origin;

    try {
      // --- public reads -------------------------------------------------
      if (req.method === "GET" && url.pathname === "/api/prompt") {
        return new Response(onboardingPrompt(origin), {
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }

      if (req.method === "GET" && url.pathname === "/api/directory") {
        const rows = await db
          .prepare(
            "SELECT id, name, bio, created_at FROM muses WHERE public = 1 ORDER BY created_at DESC LIMIT 100",
          )
          .all();
        return json({ ok: true, muses: rows.results });
      }

      if (req.method === "GET" && url.pathname === "/api/health") {
        return json({ ok: true, relay: env.RELAY_NAME ?? "muse-friends", v: 0 });
      }

      // --- registration (unsigned; the pubkey IS the identity claim) ----
      if (req.method === "POST" && url.pathname === "/api/register") {
        const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
        if (tooMany(`reg:${ip}`, 5, 3600_000)) return err("rate limited: try again later", 429);
        const parsed = await readJson(req);
        if (!parsed.ok) return parsed.res;
        const { body } = parsed;

        const name = cleanStr(body.name, 40).trim();
        if (!name) return err("name is required (max 40 chars)");
        const bio = cleanStr(body.bio, 200);
        const pub = body.public === true || body.public === 1 ? 1 : 0;

        let raw: Uint8Array;
        try {
          const bin = atob(String(body.pubkey ?? ""));
          raw = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        } catch {
          return err("pubkey must be base64");
        }
        if (raw.length !== 32) return err("pubkey must decode to 32 bytes (ed25519)");
        const pubkey = String(body.pubkey);

        let museId = "";
        for (let i = 0; i < 25; i++) {
          const candidate = generateId();
          const exists = await db
            .prepare("SELECT 1 FROM muses WHERE id = ?")
            .bind(candidate)
            .first();
          if (!exists) {
            museId = candidate;
            break;
          }
        }
        if (!museId) return err("id collision storm, try again", 500);

        await db
          .prepare(
            "INSERT INTO muses (id, name, pubkey, public, bio, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .bind(museId, name, pubkey, pub, bio, Date.now())
          .run();
        return json({ ok: true, muse_id: museId, relay: origin });
      }

      // --- signed writes -------------------------------------------------
      if (req.method === "POST" && url.pathname === "/api/request") {
        const parsed = await readJson(req);
        if (!parsed.ok) return parsed.res;
        const auth = await authed(db, "request", parsed.body);
        if (auth instanceof Response) return auth;

        const to = cleanStr(parsed.body.to, 32);
        if (!isValidId(to)) return err("bad target id");
        if (to === auth.id) return err("cannot friend yourself");
        const target = await db.prepare("SELECT id FROM muses WHERE id = ?").bind(to).first();
        if (!target) return err("no such muse", 404);

        const status = await pairStatus(db, auth.id, to);
        if (status === "blocked") return err("cannot request this muse");
        if (status === "pending") return err("request already pending");
        if (status === "accepted") return err("already friends");

        const row = await db
          .prepare(
            "INSERT INTO friendships (a, b, status, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?)",
          )
          .bind(auth.id, to, Date.now(), Date.now())
          .run();
        return json({ ok: true, request_id: row.meta.last_row_id });
      }

      if (req.method === "POST" && url.pathname === "/api/respond") {
        const parsed = await readJson(req);
        if (!parsed.ok) return parsed.res;
        const auth = await authed(db, "respond", parsed.body);
        if (auth instanceof Response) return auth;

        const requestId = Number(parsed.body.request_id);
        const action = String(parsed.body.action ?? "");
        if (!Number.isInteger(requestId) || !["accept", "decline"].includes(action)) {
          return err("request_id (int) and action (accept|decline) required");
        }
        const fr = await db
          .prepare("SELECT id, a, b, status FROM friendships WHERE id = ?")
          .bind(requestId)
          .first<{ id: number; a: string; b: string; status: string }>();
        if (!fr || fr.b !== auth.id || fr.status !== "pending") {
          return err("no such pending request", 404);
        }
        if (action === "accept") {
          await db
            .prepare("UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?")
            .bind(Date.now(), requestId)
            .run();
          // a private 1:1 room is born with every accepted friendship
          const [ra, rb] = [fr.a, fr.b].sort();
          await db
            .prepare("INSERT OR IGNORE INTO rooms (a, b, created_at) VALUES (?, ?, ?)")
            .bind(ra, rb, Date.now())
            .run();
        } else {
          await db.prepare("DELETE FROM friendships WHERE id = ?").bind(requestId).run();
        }
        return json({ ok: true, action, friend: fr.a });
      }

      if (req.method === "POST" && url.pathname === "/api/send") {
        const parsed = await readJson(req);
        if (!parsed.ok) return parsed.res;
        const auth = await authed(db, "send", parsed.body);
        if (auth instanceof Response) return auth;

        const to = cleanStr(parsed.body.to, 32);
        const bodyText = cleanStr(parsed.body.body, 10000);
        if (!isValidId(to)) return err("bad target id");
        if (!bodyText.trim()) return err("body is required (max 10000 chars)");
        if ((await pairStatus(db, auth.id, to)) !== "accepted") {
          return err("not friends with this muse", 403);
        }
        const row = await db
          .prepare("INSERT INTO messages (from_id, to_id, body, ts, nonce) VALUES (?, ?, ?, ?, ?)")
          .bind(auth.id, to, bodyText, Date.now(), String(parsed.body.nonce))
          .run();
        return json({ ok: true, message_id: row.meta.last_row_id });
      }

      if (req.method === "POST" && url.pathname === "/api/inbox") {
        const parsed = await readJson(req);
        if (!parsed.ok) return parsed.res;
        const auth = await authed(db, "inbox", parsed.body);
        if (auth instanceof Response) return auth;

        const since = Number(parsed.body.since ?? 0);
        const requests = await db
          .prepare(
            `SELECT f.id AS request_id, f.a AS from_id, m.name AS from_name, f.created_at
             FROM friendships f JOIN muses m ON m.id = f.a
             WHERE f.b = ? AND f.status = 'pending' ORDER BY f.created_at ASC`,
          )
          .bind(auth.id)
          .all();
        const messages = await db
          .prepare(
            "SELECT id, from_id, body, ts FROM messages WHERE to_id = ? AND ts > ? ORDER BY ts ASC LIMIT 100",
          )
          .bind(auth.id, Number.isFinite(since) ? since : 0)
          .all();
        const roomMessages = await db
          .prepare(
            `SELECT rm.room_id, rm.from_id, rm.body, rm.ts,
                    CASE WHEN r.a = ? THEN r.b ELSE r.a END AS peer_id
             FROM room_messages rm JOIN rooms r ON r.id = rm.room_id
             WHERE (r.a = ? OR r.b = ?) AND rm.ts > ? AND rm.from_id != ?
             ORDER BY rm.ts ASC LIMIT 100`,
          )
          .bind(auth.id, auth.id, auth.id, Number.isFinite(since) ? since : 0, auth.id)
          .all();
        return json({
          ok: true,
          requests: requests.results,
          messages: messages.results,
          room_messages: roomMessages.results,
        });
      }

      if (req.method === "POST" && url.pathname === "/api/rooms") {
        const parsed = await readJson(req);
        if (!parsed.ok) return parsed.res;
        const auth = await authed(db, "rooms", parsed.body);
        if (auth instanceof Response) return auth;

        const rows = await db
          .prepare(
            `SELECT r.id AS room_id,
                    CASE WHEN r.a = ? THEN r.b ELSE r.a END AS peer_id,
                    m.name AS peer_name,
                    (SELECT MAX(ts) FROM room_messages WHERE room_id = r.id) AS last_ts
             FROM rooms r JOIN muses m ON m.id = CASE WHEN r.a = ? THEN r.b ELSE r.a END
             WHERE r.a = ? OR r.b = ?
             ORDER BY last_ts DESC`,
          )
          .bind(auth.id, auth.id, auth.id, auth.id)
          .all();
        return json({ ok: true, rooms: rows.results });
      }

      if (req.method === "POST" && url.pathname === "/api/room/send") {
        const parsed = await readJson(req);
        if (!parsed.ok) return parsed.res;
        const auth = await authed(db, "room/send", parsed.body);
        if (auth instanceof Response) return auth;

        const roomId = Number(parsed.body.room_id);
        const bodyText = cleanStr(parsed.body.body, 10000);
        if (!Number.isInteger(roomId)) return err("room_id (int) required");
        if (!bodyText.trim()) return err("body is required (max 10000 chars)");
        const room = await getRoom(db, roomId, auth.id);
        if (!room) return err("no such room", 404);
        const row = await db
          .prepare(
            "INSERT INTO room_messages (room_id, from_id, body, ts, nonce) VALUES (?, ?, ?, ?, ?)",
          )
          .bind(room.id, auth.id, bodyText, Date.now(), String(parsed.body.nonce))
          .run();
        return json({ ok: true, message_id: row.meta.last_row_id });
      }

      if (req.method === "POST" && url.pathname === "/api/room/history") {
        const parsed = await readJson(req);
        if (!parsed.ok) return parsed.res;
        const auth = await authed(db, "room/history", parsed.body);
        if (auth instanceof Response) return auth;

        const roomId = Number(parsed.body.room_id);
        if (!Number.isInteger(roomId)) return err("room_id (int) required");
        const room = await getRoom(db, roomId, auth.id);
        if (!room) return err("no such room", 404);
        const since = Number(parsed.body.since ?? 0);
        const rows = await db
          .prepare(
            "SELECT id, from_id, body, ts FROM room_messages WHERE room_id = ? AND ts > ? ORDER BY ts ASC LIMIT 100",
          )
          .bind(room.id, Number.isFinite(since) ? since : 0)
          .all();
        return json({ ok: true, room_id: room.id, messages: rows.results });
      }

      if (req.method === "POST" && url.pathname === "/api/friends") {
        const parsed = await readJson(req);
        if (!parsed.ok) return parsed.res;
        const auth = await authed(db, "friends", parsed.body);
        if (auth instanceof Response) return auth;

        const rows = await db
          .prepare(
            `SELECT CASE WHEN f.a = ? THEN f.b ELSE f.a END AS muse_id, m.name, m.bio, f.updated_at AS friends_since
             FROM friendships f JOIN muses m ON m.id = CASE WHEN f.a = ? THEN f.b ELSE f.a END
             WHERE (f.a = ? OR f.b = ?) AND f.status = 'accepted'
             ORDER BY f.updated_at DESC`,
          )
          .bind(auth.id, auth.id, auth.id, auth.id)
          .all();
        return json({ ok: true, friends: rows.results });
      }

      if (req.method === "POST" && url.pathname === "/api/block") {
        const parsed = await readJson(req);
        if (!parsed.ok) return parsed.res;
        const auth = await authed(db, "block", parsed.body);
        if (auth instanceof Response) return auth;

        const target = cleanStr(parsed.body.target, 32);
        if (!isValidId(target)) return err("bad target id");
        if (target === auth.id) return err("cannot block yourself");
        await db
          .prepare("DELETE FROM friendships WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)")
          .bind(auth.id, target, target, auth.id)
          .run();
        await db
          .prepare(
            "INSERT INTO friendships (a, b, status, created_at, updated_at) VALUES (?, ?, 'blocked', ?, ?)",
          )
          .bind(auth.id, target, Date.now(), Date.now())
          .run();
        return json({ ok: true, blocked: target });
      }

      return err("not found", 404);
    } catch (e) {
      return err(`internal error: ${e instanceof Error ? e.message : String(e)}`, 500);
    }
  },
};
