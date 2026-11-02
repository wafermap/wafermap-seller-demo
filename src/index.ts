// A tiny seller for the Wafermap Inference Marketplace, used to test listings end to end and as the
// reference implementation shown in the docs. It does three things:
//   GET  /.well-known/wafermap-seller.json  the domain proof: which wallets may list this API
//   POST /text-stats                         a JSON API (kind "json"): word, character and sentence counts
//   POST /v1/chat/completions                an OpenAI-style model (kind "openai") backed by Workers AI
// Every POST must carry Wafermap's HMAC signature (X-Wafermap-Signature over `${timestamp}.${body}`,
// with the listing's secret, at most 5 minutes old), so calls that skip Wafermap (and its payment) fail.
interface Env {
  AI: Ai;
  /** Comma-separated wallet addresses allowed to list this API. */
  SELLERS: string;
  /** Comma-separated listing secrets (whsec_…), one per listing on this host. Empty = signatures not checked. */
  LISTING_SECRETS?: string;
}

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });

async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string compare. */
const same = (a: string, b: string) => a.length === b.length && [...a].reduce((d, ch, i) => d | (ch.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

async function signed(req: Request, body: string, env: Env): Promise<boolean> {
  const secrets = (env.LISTING_SECRETS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!secrets.length) return true;
  const ts = req.headers.get("x-wafermap-timestamp") ?? "";
  const sig = (req.headers.get("x-wafermap-signature") ?? "").replace(/^sha256=/, "");
  if (!/^\d+$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  for (const s of secrets) if (same(await hmacHex(s, `${ts}.${body}`), sig)) return true;
  return false;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/.well-known/wafermap-seller.json") return json({ sellers: env.SELLERS.split(",").map((s) => s.trim()).filter(Boolean) });
    if (req.method === "GET" && url.pathname === "/") return json({ name: "Wafermap demo seller", docs: "https://wafermap.xyz/docs#sell" });
    if (req.method !== "POST") return json({ error: "not_found" }, 404);
    const body = await req.text();
    if (body.length > 100_000) return json({ error: "too_large" }, 413);
    if (!(await signed(req, body, env))) return json({ error: "unsigned", message: "Call this API through wafermap.xyz/v1/m/…" }, 401);
    let input: any;
    try {
      input = JSON.parse(body);
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (url.pathname === "/text-stats") {
      const text = String(input?.text ?? "");
      if (!text) return json({ error: "text is required" }, 400);
      const words = text.trim().split(/\s+/).filter(Boolean);
      return json({ characters: text.length, words: words.length, sentences: (text.match(/[.!?]+(\s|$)/g) ?? []).length || (text.trim() ? 1 : 0), longestWord: words.reduce((a, w) => (w.length > a.length ? w : a), ""), computedAt: new Date().toISOString() });
    }
    if (url.pathname === "/v1/chat/completions") {
      const messages = Array.isArray(input?.messages) ? input.messages.slice(-20) : [];
      if (!messages.length) return json({ error: "messages is required" }, 400);
      const out: any = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast" as any, { messages, max_tokens: Math.min(Number(input?.max_tokens) || 256, 512) });
      return json({ id: `demo-${crypto.randomUUID()}`, object: "chat.completion", created: Math.floor(Date.now() / 1000), model: String(input?.model ?? "demo"), choices: [{ index: 0, message: { role: "assistant", content: String(out?.response ?? "") }, finish_reason: "stop" }] });
    }
    return json({ error: "not_found" }, 404);
  },
} satisfies ExportedHandler<Env>;
