/**
 * billing — checkout + webhook Stripe, sans serveur à héberger.
 *
 * Dernier morceau qui vivait sur Render (server/app.py). Render s'est fait
 * suspendre le 15/07/2026 pour dépassement de quota ; on ne remet pas un
 * service à entretenir dans le chemin.
 *
 * POURQUOI DU CODE ICI, alors que tout le reste est en SQL (migrations 0005-0007) :
 * Stripe signe ses webhooks avec un HMAC-SHA256 calculé sur `{timestamp}.{corps
 * brut}`. PostgREST parse le JSON avant de le passer à une fonction SQL : les
 * octets exacts sont perdus, et re-sérialiser ne redonne pas le même message. La
 * signature deviendrait invérifiable — donc n'importe qui s'offrirait le plan Pro
 * en postant un faux webhook. C'est LA raison, et la seule.
 *
 * POURQUOI STRIPE et plus Lemon Squeezy (tranché par Adam, 17/07/2026) : sur des
 * petits tickets, LS prend le double (~14 % sur un abonnement à 5 €/mois, contre
 * ~6,5 %). Son Merchant of Record (TVA collectée et reversée dans les 27) ne se
 * justifie pas sous le seuil européen de 10 000 €/an de ventes B2C numériques
 * transfrontalières. C'est CE seuil qui devra rouvrir le débat, pas une intuition.
 *
 * GAIN DE SÉCURITÉ AU PASSAGE : chez LS, le compte était désigné par un jeton
 * signé glissé dans une URL que l'utilisateur pouvait tripoter — d'où un HMAC
 * maison pour s'en protéger. Ici, la Checkout Session est créée par NOUS via
 * l'API : l'uid est posé dans `subscription_data.metadata` côté serveur, ne passe
 * jamais par le navigateur, et n'est donc pas falsifiable. Plus de jeton signé,
 * plus de secret de lien. Moins de code ET plus sûr.
 *
 * Routes (déployée --no-verify-jwt : Stripe ne peut PAS envoyer de JWT Supabase ;
 * l'authentification est faite ici, par signature ou par clé cet_) :
 *   POST /billing/checkout {api_key} -> {url} vers la page de paiement Stripe
 *   POST /billing/webhook            -> vérifie la signature, écrit le plan
 *   GET  /billing/health             -> dit CE QUI MANQUE, jamais les valeurs
 *
 * La clé cet_ voyage dans le CORPS, jamais dans l'URL (historique, logs, Referer).
 *
 * Secrets (via `supabase secrets set`, JAMAIS dans le dépôt) :
 *   STRIPE_SECRET_KEY      sk_live_... ou sk_test_...
 *   STRIPE_PRICE_ID        price_... (l'abonnement mensuel)
 *   STRIPE_WEBHOOK_SECRET  whsec_... (donné par Stripe à la création du endpoint)
 *   FRONTEND_URL           l'app, pour le retour après paiement
 * SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.
 */

// La logique pure (mapping des statuts, signature) vit dans logic.ts et est
// testée telle quelle par tests/test_billing.mjs. Ici : uniquement de l'I/O.
import {
  derivePlan,
  STRIPE_STATUS,
  stripeStatusToCanonical,
  verifyStripeSignature,
} from "./logic.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_PRICE_ID = Deno.env.get("STRIPE_PRICE_ID") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const FRONTEND_URL = (Deno.env.get("FRONTEND_URL") ??
  "https://arochab.github.io/claude-eats-tokens").replace(/\/+$/, "");

const enc = new TextEncoder();

async function sha256Hex(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return [...d].map((x) => x.toString(16).padStart(2, "0")).join("");
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
  if (!r.ok) console.error(`patch user ${userId} -> ${r.status} ${await r.text()}`);
  return r.ok;
}

async function userByApiKey(apiKey: string) {
  if (!apiKey || apiKey.length < 24) return null;
  const rows = await sbGet(
    `users?api_key_hash=eq.${await sha256Hex(apiKey)}&select=id,email,plan,billing_customer_id`);
  return rows[0] ?? null;
}

// --- Appels Stripe (form-encoded : l'API Stripe n'accepte pas du JSON) -------
async function stripe(path: string, form?: Record<string, string>): Promise<any> {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: form ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message ?? `stripe ${r.status}`);
  return j;
}

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

// --- 1) CHECKOUT ------------------------------------------------------------
async function handleCheckout(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const user = await userByApiKey(String(body?.api_key ?? ""));
  if (!user) return json({ error: "unauthorized" }, 401);

  // Pas encore branché côté Stripe : on le dit franchement plutôt que de
  // renvoyer une URL cassée.
  if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_ID) {
    return json({ error: "checkout not configured" }, 503);
  }

  if (user.plan === "pro") return json({ error: "already pro" }, 409);

  const form: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": STRIPE_PRICE_ID,
    "line_items[0][quantity]": "1",
    success_url: `${FRONTEND_URL}/?paid=1`,
    cancel_url: `${FRONTEND_URL}/`,
    // L'uid est posé ICI, côté serveur : il ne passe jamais par le navigateur,
    // donc rien à signer et rien à falsifier. Sur la SESSION *et* sur
    // l'abonnement : les événements customer.subscription.* ne voient que ce
    // dernier, et c'est eux qui portent les changements de statut dans le temps.
    "metadata[uid]": user.id,
    "subscription_data[metadata][uid]": user.id,
    // Rattache au client existant s'il y en a un, sinon on pré-remplit l'email
    // et Stripe crée le client lui-même : pas de doublon à chaque essai.
    // PAS de `customer_creation` ici : ce paramètre n'existe qu'en mode
    // `payment` (Stripe répond 400 en mode `subscription`, où le client est
    // créé d'office). Erreur trouvée en test — en live, c'eût été un bouton
    // « Passer à Pro » mort.
    ...(user.billing_customer_id
      ? { customer: String(user.billing_customer_id) }
      : { customer_email: String(user.email ?? "") }),
  };

  try {
    const session = await stripe("checkout/sessions", form);
    if (!session?.url) return json({ error: "checkout failed" }, 502);
    return json({ url: session.url });
  } catch (e) {
    console.error("checkout:", e instanceof Error ? e.message : String(e));
    return json({ error: "checkout failed" }, 502);
  }
}

// --- 2) WEBHOOK -------------------------------------------------------------
/** Événements qui portent un changement d'état d'abonnement. Le reste est
 *  ACQUITTÉ sans agir, pour ne pas déclencher les retries de Stripe. */
const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

async function resolveUserId(subOrSession: any): Promise<string | null> {
  // Confiance décroissante : metadata posée par nous, puis id d'abonnement,
  // puis email.
  const uid = subOrSession?.metadata?.uid;
  if (typeof uid === "string" && uid) {
    const rows = await sbGet(`users?id=eq.${encodeURIComponent(uid)}&select=id`);
    if (rows[0]?.id) return rows[0].id;
  }
  const subId = String(subOrSession?.id ?? "");
  if (subId.startsWith("sub_")) {
    const rows = await sbGet(
      `users?billing_subscription_id=eq.${encodeURIComponent(subId)}&select=id`);
    if (rows[0]?.id) return rows[0].id;
  }
  const email = String(
    subOrSession?.customer_email ?? subOrSession?.customer_details?.email ?? "",
  ).trim().toLowerCase();
  if (email) {
    const rows = await sbGet(`users?email=eq.${encodeURIComponent(email)}&select=id`);
    if (rows[0]?.id) return rows[0].id;
  }
  return null;
}

async function handleWebhook(req: Request): Promise<Response> {
  // LE point : on lit le corps BRUT et on signe CES octets-là. Passer par
  // req.json() puis re-sérialiser donnerait un autre message, et la signature
  // ne tomberait jamais juste.
  const raw = await req.text();
  if (!STRIPE_WEBHOOK_SECRET) return json({ error: "webhook not configured" }, 503);

  const ok = await verifyStripeSignature(
    raw,
    req.headers.get("Stripe-Signature") ?? "",
    STRIPE_WEBHOOK_SECRET,
    Math.floor(Date.now() / 1000),
  );
  if (!ok) return json({ error: "invalid signature" }, 401);

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const type = String(event?.type ?? "");
  if (!HANDLED.has(type)) return json({ ok: true, ignored: type });

  const obj = event?.data?.object ?? {};

  // checkout.session.completed ne porte PAS le statut : il annonce que le
  // paiement est passé. On va chercher l'abonnement pour connaître son état
  // réel plutôt que de le supposer 'active'.
  let sub = obj;
  if (type === "checkout.session.completed") {
    const subId = String(obj?.subscription ?? "");
    if (!subId) return json({ ok: true, ignored: "session sans abonnement" });
    try {
      sub = await stripe(`subscriptions/${encodeURIComponent(subId)}`);
      // La session porte l'uid même si l'abonnement ne l'a pas (vieux flux).
      if (!sub?.metadata?.uid && obj?.metadata?.uid) {
        sub.metadata = { ...(sub.metadata ?? {}), uid: obj.metadata.uid };
      }
      if (!sub?.customer_email && obj?.customer_details?.email) {
        sub.customer_email = obj.customer_details.email;
      }
    } catch (e) {
      console.error("lecture abonnement:", e instanceof Error ? e.message : String(e));
      return json({ error: "subscription fetch failed" }, 500); // Stripe retentera
    }
  }

  const userId = await resolveUserId(sub);
  if (!userId) {
    // Abonnement orphelin : on ACQUITTE pour ne pas boucler en retries.
    console.error(`webhook ${type} : utilisateur introuvable (sub=${sub?.id})`);
    return json({ ok: true, unresolved: true });
  }

  const canonical = stripeStatusToCanonical(sub?.status);
  if (canonical === "none" && sub?.status && !(sub.status in STRIPE_STATUS)) {
    console.error(`statut Stripe inconnu : ${sub.status} (traite en free)`);
  }

  const endsAt = sub?.current_period_end ?? sub?.cancel_at ?? null;

  // État ABSOLU (et non un delta) : rejouer le même webhook donne le même
  // résultat. C'est ce qui rend l'ensemble idempotent, sans table de dédup.
  const okWrite = await sbPatchUser(userId, {
    plan: derivePlan(canonical),
    plan_status: canonical,
    billing_subscription_id: String(sub?.id ?? "") || null,
    billing_customer_id: sub?.customer ? String(sub.customer) : null,
    plan_renews_at: endsAt ? new Date(endsAt * 1000).toISOString() : null,
    updated_at: "now()",
  });
  // 500 -> Stripe retentera. Un échec réseau ne doit pas perdre un paiement en
  // silence.
  if (!okWrite) return json({ error: "update failed" }, 500);

  return json({ ok: true, event: type, plan: derivePlan(canonical) });
}

// --- Routage ----------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const path = new URL(req.url).pathname.replace(/\/+$/, "").split("/").pop();

  if (req.method === "POST" && path === "checkout") return handleCheckout(req);
  if (req.method === "POST" && path === "webhook") return handleWebhook(req);
  if (req.method === "GET" && path === "health") {
    return json({
      ok: true,
      provider: "stripe",
      checkoutConfigured: !!(STRIPE_SECRET_KEY && STRIPE_PRICE_ID),
      webhookConfigured: !!STRIPE_WEBHOOK_SECRET,
      liveMode: STRIPE_SECRET_KEY.startsWith("sk_live_"),
    });
  }
  return json({ error: "not found" }, 404);
});
