import crypto from "node:crypto";

export function pickMarketByDomain(shopDomain, env = process.env) {
  const map = {
    EU: env.SHOP_DOMAIN_EU,
    UK: env.SHOP_DOMAIN_UK,
    US: env.SHOP_DOMAIN_US
  };
  for (const [market, domain] of Object.entries(map)) {
    if (domain && shopDomain && domain.toLowerCase() === shopDomain.toLowerCase()) {
      return market;
    }
  }
  return null;
}

export function sealCredsForMarket(market, env = process.env) {
  const t = env[`SEAL_SUBS_TOKEN_${market}`];
  const s = env[`SEAL_SUBS_SECRET_${market}`];
  if (!t || !s) throw new Error(`Missing Seal API creds for market ${market}`);
  return { token: t, secret: s };
}

// Verify Seal webhook HMAC (X-Seal-Hmac-Sha256) over raw JSON body string
export function verifySealHmac(rawBody, headerHmac, secret) {
  if (!headerHmac) return false;
  const calc = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(headerHmac));
}

// Optional: protect the Flow -> Render call with a shared secret header
export function verifyFlowSharedSecret(req, env = process.env) {
  const expected = env.FLOW_SHARED_SECRET;
  if (!expected) return true; // disabled
  const got = req.header("X-Flow-Secret");
  return got && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got));
}
