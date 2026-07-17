/**
 * logic.ts — la logique PURE du paiement. Aucun I/O, aucun global Deno.
 *
 * Même découpage que le reste du projet : `usage_core.py` porte le calcul pur et
 * testé, `push_usage.py` n'est qu'une coquille I/O. Ici, `index.ts` fait le
 * réseau et la base ; tout ce qui se raisonne vit dans ce fichier, et les tests
 * (tests/test_billing.mjs) importent CE fichier — pas une copie. Un test qui
 * vérifie un miroir du code ne vérifie rien.
 */

/**
 * Statuts Stripe -> vocabulaire de l'app.
 *
 * OBLIGATOIRE, pas cosmétique : users.plan_status a une contrainte qui n'accepte
 * QUE ce vocabulaire (migration 0002). Stripe dit `trialing` et `canceled` (un
 * seul L) — écrire ça brut violerait la contrainte, le PATCH échouerait, le
 * webhook renverrait 500, Stripe retenterait en boucle, et **le client aurait
 * payé sans jamais recevoir son Pro**.
 */
export const STRIPE_STATUS: Record<string, string> = {
  active: "active",
  trialing: "on_trial",
  past_due: "past_due",
  canceled: "cancelled",
  unpaid: "expired",
  incomplete: "none",
  incomplete_expired: "expired",
  paused: "paused",
};

/** Statut Stripe -> statut canonique. Inconnu -> 'none' (fail-closed).
 *  Tous les statuts qui OUVRENT l'accès sont connus et listés ; un nouveau venu
 *  sera, par construction, un état non actif. */
export function stripeStatusToCanonical(s: string | null | undefined): string {
  return STRIPE_STATUS[String(s ?? "")] ?? "none";
}

/** Statuts canoniques qui donnent droit au plan 'pro'.
 *  `past_due` reste pro : Stripe relance le paiement plusieurs jours. Couper
 *  l'accès sur une carte expirée punirait un client qui n'a rien fait de mal. */
export const ACTIVE_STATUSES = new Set(["active", "on_trial", "past_due"]);

/** PURE : statut canonique -> 'pro' | 'free'. */
export function derivePlan(canonical: string | null | undefined): string {
  return ACTIVE_STATUSES.has(String(canonical ?? "")) ? "pro" : "free";
}

/** Comparaison à temps constant : une comparaison naïve fuit la signature
 *  attendue octet par octet (l'attaquant mesure le temps d'échec). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Découpe `Stripe-Signature: t=<ts>,v1=<sig>[,v1=<sig2>]`.
 *  Plusieurs v1 sont possibles pendant une rotation de secret. */
export function parseStripeSigHeader(header: string): { t: string; v1: string[] } {
  const out = { t: "", v1: [] as string[] };
  if (!header) return out;
  for (const part of String(header).split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === "t") out.t = v;
    else if (k === "v1") out.v1.push(v);
  }
  return out;
}

const enc = new TextEncoder();

export async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return [...sig].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Vérifie une signature Stripe. La signature porte sur `${t}.${corps brut}`.
 *
 * TOLÉRANCE (5 min) : sans elle, un webhook valide capté sur le réseau pourrait
 * être REJOUÉ des mois plus tard — par exemple un `subscription_created` pour
 * se re-donner un Pro résilié. C'est la protection anti-rejeu recommandée par
 * Stripe. `nowSec` est injecté pour rester testable.
 */
export async function verifyStripeSignature(
  rawBody: string,
  header: string,
  secret: string,
  nowSec: number,
  toleranceSec = 300,
): Promise<boolean> {
  if (!header || !secret) return false;
  const { t, v1 } = parseStripeSigHeader(header);
  if (!t || !v1.length) return false;

  const ts = Number(t);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(nowSec - ts) > toleranceSec) return false;

  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  return v1.some((s) => timingSafeEqual(expected, s));
}
