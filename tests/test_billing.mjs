/**
 * Tests de la logique de paiement (tests/test_billing.mjs) — sans réseau.
 *
 * On importe le VRAI fichier (`supabase/functions/billing/logic.ts`), pas une
 * copie : un test qui vérifie un miroir du code ne vérifie rien. C'est possible
 * parce que la logique pure est séparée de l'I/O (index.ts fait le réseau et
 * appelle Deno.serve, qui n'existe pas sous Node) — même découpage que
 * usage_core.py / push_usage.py.
 *
 * Node lit le TypeScript nativement depuis la v23 (type-stripping).
 *
 * Les 2 invariants qui comptent :
 *  1. Le vocabulaire Stripe est TRADUIT avant d'atteindre la base. `trialing` ou
 *     `canceled` écrits bruts violeraient la contrainte de users.plan_status ->
 *     PATCH en échec -> webhook 500 -> Stripe retente en boucle -> le client a
 *     payé sans jamais recevoir son Pro.
 *  2. Un webhook signé mais VIEUX est refusé. Sans ça, un `subscription_created`
 *     capté sur le réseau serait rejouable des mois plus tard pour se re-donner
 *     un Pro résilié.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  STRIPE_STATUS,
  stripeStatusToCanonical,
  derivePlan,
  timingSafeEqual,
  parseStripeSigHeader,
  hmacHex,
  verifyStripeSignature,
} from "../supabase/functions/billing/logic.ts";

/* --- vocabulaire ---------------------------------------------------------- */
// Le contrat de users.plan_status (migration 0002). Si quelqu'un ajoute un
// statut ici sans toucher la contrainte, ce test tombe — c'est le but.
const AUTORISES_EN_BASE = new Set(
  ["none", "active", "on_trial", "past_due", "cancelled", "paused", "expired"]);

test("statuts — TOUTE traduction tombe dans le vocabulaire accepté par la base", () => {
  for (const [stripe, canonique] of Object.entries(STRIPE_STATUS)) {
    assert.ok(AUTORISES_EN_BASE.has(canonique),
      `${stripe} -> ${canonique} violerait la contrainte de plan_status`);
  }
});

test("statuts — les 8 statuts Stripe réels sont tous couverts", () => {
  // Liste officielle de l'API Stripe (Subscription.status).
  for (const s of ["active", "past_due", "unpaid", "canceled", "incomplete",
                   "incomplete_expired", "trialing", "paused"]) {
    assert.ok(s in STRIPE_STATUS, `statut Stripe non traduit : ${s}`);
  }
});

test("statuts — les pièges d'orthographe de Stripe", () => {
  // Stripe écrit "canceled" (un L) et "trialing" ; l'app dit "cancelled" et
  // "on_trial". C'est exactement là que ça casserait en silence.
  assert.equal(stripeStatusToCanonical("canceled"), "cancelled");
  assert.equal(stripeStatusToCanonical("trialing"), "on_trial");
});

test("statuts — un statut inconnu retombe sur none (fail-closed)", () => {
  for (const s of ["une_nouveaute_stripe_2027", "", null, undefined, "ACTIVE"]) {
    assert.equal(stripeStatusToCanonical(s), "none", String(s));
  }
});

/* --- plan ----------------------------------------------------------------- */
test("derivePlan — seuls active / on_trial / past_due ouvrent Pro", () => {
  assert.equal(derivePlan("active"), "pro");
  assert.equal(derivePlan("on_trial"), "pro");
  assert.equal(derivePlan("past_due"), "pro");
});

test("derivePlan — tout le reste est free", () => {
  for (const s of ["cancelled", "paused", "expired", "none", "", null, undefined]) {
    assert.equal(derivePlan(s), "free", String(s));
  }
});

test("derivePlan — past_due reste pro : on ne coupe pas sur une carte expirée", () => {
  // Stripe relance le paiement plusieurs jours. Couper tout de suite punirait
  // un client qui n'a rien fait de mal.
  assert.equal(derivePlan(stripeStatusToCanonical("past_due")), "pro");
});

test("derivePlan — chaîne Stripe -> plan, de bout en bout", () => {
  const attendu = {
    active: "pro", trialing: "pro", past_due: "pro",
    canceled: "free", unpaid: "free", incomplete: "free",
    incomplete_expired: "free", paused: "free",
  };
  for (const [stripe, plan] of Object.entries(attendu)) {
    assert.equal(derivePlan(stripeStatusToCanonical(stripe)), plan, stripe);
  }
});

/* --- en-tête de signature ------------------------------------------------- */
test("parseStripeSigHeader — nominal", () => {
  const r = parseStripeSigHeader("t=1700000000,v1=abc");
  assert.equal(r.t, "1700000000");
  assert.deepEqual(r.v1, ["abc"]);
});

test("parseStripeSigHeader — plusieurs v1 (rotation de secret)", () => {
  const r = parseStripeSigHeader("t=1,v1=aaa,v1=bbb,v0=ignore");
  assert.deepEqual(r.v1, ["aaa", "bbb"]);
});

test("parseStripeSigHeader — entrées malformées ne lèvent pas", () => {
  for (const h of ["", "nimportequoi", "t=", "v1=", ",,,", "t=1"]) {
    assert.doesNotThrow(() => parseStripeSigHeader(h));
  }
});

/* --- vérification de signature -------------------------------------------- */
const SECRET = "whsec_secret_de_test";
const CORPS = '{"type":"customer.subscription.updated","data":{"object":{"id":"sub_1"}}}';
const T = 1_800_000_000;

async function entete(secret = SECRET, t = T, corps = CORPS) {
  return `t=${t},v1=${await hmacHex(secret, `${t}.${corps}`)}`;
}

test("signature — une signature valide et fraîche passe", async () => {
  assert.equal(await verifyStripeSignature(CORPS, await entete(), SECRET, T), true);
});

test("signature — mauvais secret -> refusé", async () => {
  const h = await entete("whsec_autre_secret");
  assert.equal(await verifyStripeSignature(CORPS, h, SECRET, T), false);
});

test("signature — corps modifié d'un seul octet -> refusé", async () => {
  const h = await entete();
  assert.equal(await verifyStripeSignature(CORPS + " ", h, SECRET, T), false);
});

test("signature — LE test anti-rejeu : signature valide mais vieille -> refusée", async () => {
  const h = await entete();                       // signée à T
  // Rejouée 10 min plus tard : la signature est toujours mathématiquement
  // bonne. Seule la tolérance de fraîcheur l'arrête.
  assert.equal(await verifyStripeSignature(CORPS, h, SECRET, T + 600), false);
  // Et 4 min plus tard : encore acceptée (tolérance 5 min).
  assert.equal(await verifyStripeSignature(CORPS, h, SECRET, T + 240), true);
});

test("signature — un webhook daté du futur est refusé aussi", async () => {
  const h = await entete(SECRET, T + 3600);
  assert.equal(await verifyStripeSignature(CORPS, h, SECRET, T), false);
});

test("signature — la bonne signature parmi plusieurs v1 suffit", async () => {
  const bonne = await hmacHex(SECRET, `${T}.${CORPS}`);
  const h = `t=${T},v1=deadbeef,v1=${bonne}`;
  assert.equal(await verifyStripeSignature(CORPS, h, SECRET, T), true);
});

test("signature — en-tête ou secret absent -> refusé, jamais d'exception", async () => {
  assert.equal(await verifyStripeSignature(CORPS, "", SECRET, T), false);
  assert.equal(await verifyStripeSignature(CORPS, await entete(), "", T), false);
  assert.equal(await verifyStripeSignature(CORPS, "t=abc,v1=x", SECRET, T), false);
  assert.equal(await verifyStripeSignature(CORPS, "v1=x", SECRET, T), false);
});

test("signature — elle porte sur les OCTETS BRUTS, pas sur le JSON reparsé", async () => {
  // Re-sérialiser change le texte, donc la signature. C'est précisément
  // pourquoi ce webhook ne peut pas vivre dans une fonction SQL : PostgREST ne
  // donne que le JSON déjà parsé.
  const espace = '{"type": "customer.subscription.updated", "data": {"object": {"id": "sub_1"}}}';
  assert.deepEqual(JSON.parse(espace), JSON.parse(CORPS), "même objet");
  assert.notEqual(await hmacHex(SECRET, `${T}.${espace}`),
                  await hmacHex(SECRET, `${T}.${CORPS}`),
                  "mais signatures différentes");
});

/* --- comparaison ---------------------------------------------------------- */
test("timingSafeEqual — égalité et inégalité", () => {
  assert.equal(timingSafeEqual("abc", "abc"), true);
  assert.equal(timingSafeEqual("abc", "abd"), false);
  assert.equal(timingSafeEqual("abc", "abcd"), false);
  assert.equal(timingSafeEqual("", ""), true);
});
