/**
 * BuildEye AI landing — "I want it on iPhone" demand counter.
 *
 * Everything else on this domain is a static asset; Workers Assets serves those
 * directly and only calls this script for paths that don't match a file.
 *
 *   GET  /api/ios-interest  → { count }
 *   POST /api/ios-interest  → { count, counted }  (one vote per visitor)
 *
 * Storage is Workers KV, which has no atomic increment, so a vote is a
 * read-modify-write. At landing-page traffic that's fine; if two votes ever land
 * in the same second one of them can be lost, and the number is a demand signal,
 * not an accounting record.
 */

const COUNT_KEY = "ios_interest_count";
const VOTER_TTL = 60 * 60 * 24 * 180; // remember a voter for ~6 months

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** Stable, non-reversible id for a visitor — we never store the raw IP. */
async function voterKey(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ua = request.headers.get("User-Agent") || "";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`buildeye-ios:${ip}:${ua}`),
  );
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `voter:${hex.slice(0, 32)}`;
}

async function readCount(kv) {
  return Number(await kv.get(COUNT_KEY)) || 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== "/api/ios-interest") {
      return new Response("Not found", { status: 404 });
    }

    const kv = env.IOS_INTEREST;
    if (!kv) {
      // KV binding missing (e.g. a preview deploy) — fail soft, the button
      // stays usable and simply shows no number.
      return json({ error: "counter_unavailable" }, 503);
    }

    if (request.method === "GET") {
      return json({ count: await readCount(kv) });
    }

    if (request.method === "POST") {
      const key = await voterKey(request);
      const count = await readCount(kv);

      if (await kv.get(key)) {
        return json({ count, counted: false });
      }

      const next = count + 1;
      await kv.put(COUNT_KEY, String(next));
      await kv.put(key, "1", { expirationTtl: VOTER_TTL });
      return json({ count: next, counted: true });
    }

    return json({ error: "method_not_allowed" }, 405);
  },
};
