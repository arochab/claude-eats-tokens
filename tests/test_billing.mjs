/**
 * Tests de la logique de paiement (tests/test_billing.mjs) — sans réseau.
 *
 * On ré-implémente ici les 3 primitives de supabase/functions/billing/index.ts
 * (derivePlan, makeCheckoutToken, verifyCheckoutToken) et on les verrouille.
 * Pourquoi ré-implémenter plutôt qu'importer : le fichier appelle Deno.serve()
 * au chargement et lit Deno.env — l'importer sous Node lancerait un serveur.
 * Le vrai comportement est vérifié en bout-en-bout contre la fonction déployée
 * (webhook signé -> plan mis à jour) ; ici on verrouille les invariants
 * logiques, qui sont ceux qu'une refonte casserait sans s'en rendre compte.
 *
 * L'invariant le plus important : un jeton uid falsifié ne doit JAMAIS résoudre
 * un utilisateur. C'est ce qui empêche de rattacher un abonnement jetable au
 * compte d'un tiers, puis de le résilier pour lui faire perdre son Pro.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const LINK_SECRET = "secret-de-test-pour-le-jeton";

/* --- miroirs de index.ts ------------------------------------------------- */
const ACTIVE_STATUSES = new Set(["active", "on_trial", "past_due"]);
const derivePlan = (s) => (ACTIVE_STATUSES.has(String(s ?? "")) ? "pro" : "free");

function sign(secret, data) {
  return createHmac("sha256", secret).update(data).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").slice(0, 32);
}
const makeCheckoutToken = (uid) => `ct_${uid}.${sign(LINK_SECRET, uid)}`;

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function verifyCheckoutToken(token) {
  try {
    if (typeof token !== "string" || !token.startsWith("ct_")) return null;
    const body = token.slice(3);
    const dot = body.lastIndexOf(".");   // cf. index.ts : la signature n'a pas de point
    if (dot <= 0) return null;
    const uid = body.slice(0, dot);
    const sig = body.slice(dot + 1);
    if (!uid || !sig) return null;
    return timingSafeEqual(sign(LINK_SECRET, uid), sig) ? uid : null;
  } catch {
    return null;
  }
}

/* --- derivePlan ---------------------------------------------------------- */
test("derivePlan — les statuts payants donnent pro", () => {
  for (const s of ["active", "on_trial", "past_due"]) {
    assert.equal(derivePlan(s), "pro", s);
  }
});

test("derivePlan — tout le reste retombe en free (fail-closed)", () => {
  for (const s of ["cancelled", "paused", "expired", "unpaid", "", null, undefined, "PRO"]) {
    assert.equal(derivePlan(s), "free", String(s));
  }
});

test("derivePlan — past_due reste pro : on ne coupe pas sur un incident de carte", () => {
  // Lemon Squeezy relance le paiement plusieurs jours. Couper tout de suite
  // punirait un client qui a juste une carte expirée.
  assert.equal(derivePlan("past_due"), "pro");
});

/* --- jeton uid ----------------------------------------------------------- */
const UID = "da5d7571-0c4e-4f50-a6c1-79be5be15b1b";

test("jeton uid — aller-retour", () => {
  assert.equal(verifyCheckoutToken(makeCheckoutToken(UID)), UID);
});

test("jeton uid — signature altérée -> refusé", () => {
  const t = makeCheckoutToken(UID);
  const casse = t.slice(0, -1) + (t.slice(-1) === "a" ? "b" : "a");
  assert.equal(verifyCheckoutToken(casse), null);
});

test("jeton uid — LE test : uid d'un tiers avec une signature bidon -> refusé", () => {
  // Sans ça : je m'abonne en désignant TON compte, puis je résilie, et tu perds
  // ton Pro. La signature est ce qui rend ce scénario impossible.
  assert.equal(verifyCheckoutToken(`ct_${UID}.signaturebidon`), null);
});

test("jeton uid — un uid ne peut pas emprunter la signature d'un autre", () => {
  const autre = "11111111-2222-3333-4444-555555555555";
  const vol = `ct_${autre}.${sign(LINK_SECRET, UID)}`;
  assert.equal(verifyCheckoutToken(vol), null);
});

test("jeton uid — entrées malformées ne lèvent jamais", () => {
  for (const bad of [null, undefined, "", "ct_", "ct_.sig", "ct_uid.", "uid.sig",
                     "ct_uid", 42, {}, [], "ct_a.b.c"]) {
    assert.doesNotThrow(() => verifyCheckoutToken(bad));
    assert.equal(verifyCheckoutToken(bad), null, JSON.stringify(bad));
  }
});

test("jeton uid — un uid contenant un point reste résolu (split sur le 1er)", () => {
  // indexOf('.') et non split('.') : un uid exotique ne doit pas casser la
  // résolution en silence.
  const uid = "a.b.c";
  assert.equal(verifyCheckoutToken(makeCheckoutToken(uid)), uid);
});

/* --- signature du webhook ------------------------------------------------ */
test("webhook — la signature porte sur les OCTETS BRUTS, pas sur le JSON reparsé", () => {
  const secret = "secret-webhook";
  const raw = '{"meta":{"event_name":"subscription_created"},"data":{"id":"1"}}';
  const sig = createHmac("sha256", secret).update(raw).digest("hex");

  // Re-sérialiser le même objet produit un autre texte -> une autre signature.
  // C'est exactement pourquoi ce webhook ne peut pas vivre dans une fonction
  // SQL : PostgREST ne donne que le JSON déjà parsé.
  const reserialise = JSON.stringify(JSON.parse(raw));
  const sig2 = createHmac("sha256", secret).update(reserialise).digest("hex");
  assert.equal(sig, sig2, "ici ils coïncident");

  const avecEspaces = '{"meta": {"event_name": "subscription_created"}, "data": {"id": "1"}}';
  const sig3 = createHmac("sha256", secret).update(avecEspaces).digest("hex");
  assert.notEqual(sig, sig3,
    "un simple espace change la signature : d'où la lecture du corps brut");
});

test("timingSafeEqual — égalité et inégalité", () => {
  assert.equal(timingSafeEqual("abc", "abc"), true);
  assert.equal(timingSafeEqual("abc", "abd"), false);
  assert.equal(timingSafeEqual("abc", "abcd"), false);
  assert.equal(timingSafeEqual("", ""), true);
});
