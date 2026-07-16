/**
 * billing — checkout + webhook Lemon Squeezy, sans serveur à héberger.
 *
 * DERNIER morceau qui vivait sur Render (server/app.py : /billing/checkout et
 * /billing/webhook). Render s'est fait suspendre le 15/07/2026 pour dépassement
 * du quota gratuit ; on ne remet pas un service à entretenir dans le chemin.
 *
 * POURQUOI DU CODE ICI, ALORS QUE TOUT LE RESTE EST EN SQL (migrations 0005-0007) :
 * Lemon Squeezy signe ses webhooks avec un HMAC-SHA256 calculé sur le CORPS BRUT.
 * PostgREST parse le JSON avant de le passer à une fonction SQL : les octets
 * exacts sont perdus, et re-sérialiser ne redonne pas le même message. La
 * signature deviendrait invérifiable — donc n'importe qui pourrait s'offrir le
 * plan Pro en postant un faux webhook. C'est LA raison, et la seule.
 *
 * Pourquoi une Edge Function et pas un service : même plateforme que la base,
 * 500k appels/mois gratuits, pas de quota d'heures, pas d'instance à réveiller,
 * rien à maintenir. C'est la version « il n'y a plus de serveur » d'un serveur.
 *
 * Routes (déployée avec --no-verify-jwt : Lemon Squeezy ne peut PAS envoyer de
 * JWT Supabase ; l'authentification est faite ici, par HMAC ou par clé cet_) :
 *   POST /billing/checkout  {api_key}  -> {url} vers le checkout Lemon Squeezy
 *   POST /billing/webhook              -> vérifie la signature, écrit le plan
 *
 * La clé cet_ voyage dans le CORPS, jamais dans l'URL : une URL finit dans
 * l'historique, les logs et l'en-tête Referer.
 *
 * Secrets (posés via `supabase secrets set`, JAMAIS dans le dépôt) :
 *   LS_WEBHOOK_SECRET  signe les webhooks (à recopier dans le dashboard LS)
 *   LS_LINK_SECRET     signe le jeton uid porté par le checkout
 *   LS_CHECKOUT_URL    URL de checkout du produit LS (vide tant qu'il n'existe pas)
 *   FRONTEND_URL       l'app, pour la redirection de retour
 * SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.
 */

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LS_WEBHOOK_SECRET = Deno.env.get("LS_WEBHOOK_SECRET") ?? "";
const LS_LINK_SECRET = Deno.env.get("LS_LINK_SECRET") ?? "";
const LS_CHECKOUT_URL = Deno.env.get("LS_CHECKOUT_URL") ?? "";
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") ??
  "https://arochab.github.io/claude-eats-tokens";

/** Statuts Lemon Squeezy qui donnent droit au plan 'pro'. Aligné sur le Flask. */
const ACTIVE_STATUSES = new Set(["active", "on_trial", "past_due"]);

/** PURE : mappe un statut d'abonnement LS vers 'pro' ou 'free'. */
export function derivePlan(status: string | null | undefined): string {
  return ACTIVE_STATUSES.has(String(status ?? "")) ? "pro" : "free";
}

const enc = new TextEncoder();

async function hmacRaw(secret: string, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
}

function toHex(b: Uint8Array): string {
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function toB64Url(b: Uint8Array): string {
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-").replace(/\//g, "_");
}

/** Comparaison à temps constant : une comparaison naïve fuit la signature
 *  attendue octet par octet (l'attaquant mesure le temps d'échec). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(s: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))));
}

/** Jeton porté dans checkout[custom][uid], renvoyé tel quel par le webhook.
 *  Format ct_{user_id}.{sig} — identique au Flask, pour que d'anciens checkouts
 *  en vol restent résolvables. Prouve que le uid vient bien de nous : sans lui,
 *  on pourrait rattacher un abonnement jetable au compte d'un tiers puis le
 *  résilier, et lui faire perdre son Pro. */
export async function makeCheckoutToken(userId: string): Promise<string> {
  const sig = toB64Url(await hmacRaw(LS_LINK_SECRET, enc.encode(userId))).slice(0, 32);
  return `ct_${userId}.${sig}`;
}

export async function verifyCheckoutToken(token: unknown): Promise<string | null> {
  try {
    if (typeof token !== "string" || !token.startsWith("ct_")) return null;
    const body = token.slice(3);
    // DERNIER point, pas le premier : la signature est en base64url, un alphabet
    // qui ne contient PAS de point. Découper à la fin est donc exact quel que
    // soit l'uid, y compris s'il venait un jour à contenir des points (le Flask
    // d'origine découpait au premier point — sans conséquence tant que l'uid est
    // un UUID, mais c'est un piège qui dormait).
    const dot = body.lastIndexOf(".");
    if (dot <= 0) return null;
    const userId = body.slice(0, dot);
    const sig = body.slice(dot + 1);
    if (!userId || !sig) return null;
    const expected = toB64Url(await hmacRaw(LS_LINK_SECRET, enc.encode(userId))).slice(0, 32);
    return timingSafeEqual(expected, sig) ? userId : null;
  } catch {
    return null; // entrée hostile : jamais de throw
  }
}

// --- Accès base (service_role : contourne RLS, ne sort jamais d'ici) ---------
function sbHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function sbGet(path: string): Promise<any[]> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!r.ok) return [];
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j : [];
}

async function sbPatchUser(userId: string, fields: Record<string, unknown>): Promise<boolean> {
  const r = await fetch(`${SB_URL}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify(fields),
  });
  return r.ok;
}

async function userByApiKey(apiKey: string) {
  if (!apiKey || apiKey.length < 24) return null;
  const rows = await sbGet(
    `users?api_key_hash=eq.${await sha256Hex(apiKey)}&select=id,email,plan`);
  return rows[0] ?? null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

// La PWA est sur github.io : autre origine.
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// --- 1) CHECKOUT ------------------------------------------------------------
async function handleCheckout(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const user = await userByApiKey(String(body?.api_key ?? ""));
  if (!user) return json({ error: "unauthorized" }, 401);

  // Produit pas encore créé côté Lemon Squeezy : on le dit franchement plutôt
  // que de renvoyer une URL cassée.
  if (!LS_CHECKOUT_URL) return json({ error: "checkout not configured" }, 503);

  const token = await makeCheckoutToken(user.id);
  const url = LS_CHECKOUT_URL +
    "?checkout[email]=" + encodeURIComponent(user.email ?? "") +
    "&checkout[custom][uid]=" + encodeURIComponent(token) +
    "&embed=0";
  return json({ url });
}

// --- 2) WEBHOOK -------------------------------------------------------------
async function handleWebhook(req: Request): Promise<Response> {
  // LE point : on lit le corps BRUT et on signe CES octets-là. Passer par
  // req.json() puis re-sérialiser donnerait un autre message, et la signature
  // ne tomberait jamais juste.
  const raw = new Uint8Array(await req.arrayBuffer());
  const sig = req.headers.get("X-Signature") ?? "";
  if (!LS_WEBHOOK_SECRET) return json({ error: "webhook not configured" }, 503);

  const expected = toHex(await hmacRaw(LS_WEBHOOK_SECRET, raw));
  if (!timingSafeEqual(expected, sig)) return json({ error: "invalid signature" }, 401);

  let payload: any;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const event = String(payload?.meta?.event_name ?? "");
  // On n'agit que sur les abonnements. Le reste est ACQUITTÉ (200) pour ne pas
  // déclencher les retries de Lemon Squeezy sur des événements qu'on ignore.
  if (!event.startsWith("subscription_")) return json({ ok: true, ignored: event });

  const attrs = payload?.data?.attributes ?? {};
  const status = attrs?.status ?? null;
  const subId = String(payload?.data?.id ?? "");
  const custom = payload?.meta?.custom_data ?? {};

  // Résolution par confiance décroissante : jeton signé, puis id d'abonnement,
  // puis email.
  let userId = await verifyCheckoutToken(custom?.uid);
  if (!userId && subId) {
    const rows = await sbGet(
      `users?ls_subscription_id=eq.${encodeURIComponent(subId)}&select=id`);
    userId = rows[0]?.id ?? null;
  }
  if (!userId) {
    const email = String(attrs?.user_email ?? "").trim().toLowerCase();
    if (email) {
      const rows = await sbGet(`users?email=eq.${encodeURIComponent(email)}&select=id`);
      userId = rows[0]?.id ?? null;
    }
  }
  if (!userId) {
    // Abonnement orphelin : on ACQUITTE pour ne pas boucler en retries.
    console.error(`webhook ${event} : utilisateur introuvable (sub=${subId})`);
    return json({ ok: true, unresolved: true });
  }

  // État ABSOLU (et non un delta) : rejouer le même webhook donne le même
  // résultat. C'est ce qui rend l'ensemble idempotent, sans table de dédup.
  const ok = await sbPatchUser(userId, {
    plan: derivePlan(status),
    plan_status: status,
    ls_subscription_id: subId || null,
    ls_customer_id: attrs?.customer_id ? String(attrs.customer_id) : null,
    plan_renews_at: attrs?.renews_at ?? attrs?.ends_at ?? null,
    updated_at: "now()",
  });
  // 500 -> Lemon Squeezy retentera. Un échec réseau ne doit pas perdre un
  // paiement en silence.
  if (!ok) return json({ error: "update failed" }, 500);

  return json({ ok: true, event, plan: derivePlan(status) });
}

// --- Routage ----------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const path = new URL(req.url).pathname.replace(/\/+$/, "").split("/").pop();

  if (req.method === "POST" && path === "checkout") return handleCheckout(req);
  if (req.method === "POST" && path === "webhook") return handleWebhook(req);
  if (req.method === "GET" && path === "health") {
    // Diagnostic sans secret : dit CE QUI MANQUE, jamais les valeurs.
    return json({
      ok: true,
      checkoutConfigured: !!LS_CHECKOUT_URL,
      webhookConfigured: !!LS_WEBHOOK_SECRET,
      linkSecretConfigured: !!LS_LINK_SECRET,
    });
  }
  return json({ error: "not found" }, 404);
});
