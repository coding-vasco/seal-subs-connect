import express from "express";
import morgan from "morgan";
import { pickMarketByDomain, sealCredsForMarket, verifySealHmac, verifyFlowSharedSecret } from "./utils.js";
import { searchSubscriptionsByEmail, getSubscriptionById } from "./sealClient.js";

const app = express();
app.use(express.json({ type: "*/*" }));
app.use(morgan("tiny"));

/**
 * Health check
 */
app.get("/health", (_req, res) => res.json({ ok: true }));

/**
 * POST /api/subscription-lookup
 * Body from Shopify Flow (example):
 * {
 *   "shopDomain": "hey-harper-shop-nl.myshopify.com",
 *   "orderId": "1234567890",              // optional but used for narrowing
 *   "orderName": "#1234",                 // optional fallback
 *   "customerId": "gid://shopify/Customer/...",
 *   "email": "customer@example.com"
 * }
 */
app.post("/api/subscription-lookup", async (req, res) => {
  try {
    if (!verifyFlowSharedSecret(req)) return res.status(401).json({ ok: false, error: "unauthorized" });

    const { shopDomain, orderId, orderName, email } = req.body || {};
    if (!shopDomain || !email) {
      return res.status(400).json({ ok: false, error: "shopDomain and email are required" });
    }

    const market = pickMarketByDomain(shopDomain);
    if (!market) return res.status(400).json({ ok: false, error: `Unknown shopDomain: ${shopDomain}` });

    const { token } = sealCredsForMarket(market);

    // 1) Search by email (fast path)
    const candidates = await searchSubscriptionsByEmail({ token, email, withItems: true, maxPages: 5 });

    // 2) Narrow by orderId when possible (Seal payload has "order_id" on full record).
    // The list endpoint returns trimmed items; some shops get "internal_id" only.
    // Strategy: if we see "id" on candidates, fetch detail for a few and compare order_id.
    const MAX_DETAIL_FETCH = 8;
    let match = null;

    // Give mild preference to ACTIVE subscriptions first
    const sorted = candidates.sort((a, b) => {
      const sa = String(a?.status || "");
      const sb = String(b?.status || "");
      if (sa === "ACTIVE" && sb !== "ACTIVE") return -1;
      if (sb === "ACTIVE" && sa !== "ACTIVE") return 1;
      return 0;
    });

    for (const c of sorted.slice(0, MAX_DETAIL_FETCH)) {
      if (!c?.id) continue;
      const detail = await getSubscriptionById({ token, id: c.id });
      const sub = detail?.payload;
      if (!sub) continue;

      const orderIdMatches =
        !!orderId &&
        (String(sub.order_id) === String(orderId) ||
         String(sub.order_id) === String(orderId).replace(/^gid:\/\/shopify\/Order\//, ""));

      const orderNameMatches =
        !!orderName && String(sub.order_name || "").trim() === String(orderName).trim(); // order_name not always present

      if (orderIdMatches || orderNameMatches) {
        match = sub;
        break;
      }

      // If no orderId provided, take the first ACTIVE subscription for this email as best-effort
      if (!orderId && !orderName && sub?.status === "ACTIVE" && !match) match = sub;
    }

    if (!match) {
      // As a fallback, if there was only one candidate, return its detail
      if (sorted.length === 1 && sorted[0]?.id) {
        const detail = await getSubscriptionById({ token, id: sorted[0].id });
        match = detail?.payload ?? null;
      }
    }

    if (!match) {
      return res.status(404).json({
        ok: false,
        error: "subscription_not_found_for_email_order",
        hint: "Ensure the email matches the subscription owner; for guests, use the purchaser email."
      });
    }

    // Return full Seal payload. You can trim here if desired.
    return res.json({ ok: true, market, subscription: match });
  } catch (err) {
    console.error("lookup error:", err);
    return res.status(502).json({ ok: false, error: "upstream_error", detail: String(err.message || err) });
  }
});

/**
 * OPTIONAL: Seal webhook receiver (subscription/created, subscription/updated)
 * Configure per-shop with the matching secret. Add one route and detect market by `X-Seal-Shop-Domain` if Seal sends it,
 * otherwise receive one endpoint per Render service.
 */
app.post("/api/seal/webhook", express.raw({ type: "*/*" }), (req, res) => {
  try {
    const shopDomain = req.query.shopDomain || req.header("X-Seal-Shop-Domain"); // not always present
    const market = pickMarketByDomain(shopDomain);
    if (!market) return res.status(400).send("Unknown shop");

    const { secret } = sealCredsForMarket(market);
    const headerHmac = req.header("X-Seal-Hmac-Sha256");
    const raw = req.body.toString("utf8");

    if (!verifySealHmac(raw, headerHmac, secret)) return res.status(401).send("Bad HMAC");

    const payload = JSON.parse(raw);
    // TODO: forward to Shopify Flow, tag orders/customers, etc.
    console.log("Seal webhook verified:", payload?.topic || "subscription", "market:", market);
    return res.sendStatus(200);
  } catch (e) {
    console.error("webhook error", e);
    return res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Seal proxy listening on :${PORT}`));
