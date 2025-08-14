import fetch from "node-fetch";

const BASE = "https://app.sealsubscriptions.com/shopify/merchant/api";

/**
 * GET /subscriptions?query=...&with-items=true
 * Returns paginated results. We fetch first N pages until we find a match.
 */
export async function searchSubscriptionsByEmail({ token, email, withItems = true, maxPages = 3, signal }) {
  const results = [];
  const params = new URLSearchParams();
  if (email) params.set("query", email);
  if (withItems) params.set("with-items", "true");

  for (let page = 1; page <= maxPages; page++) {
    params.set("page", String(page));
    const url = `${BASE}/subscriptions?${params.toString()}`;
    const res = await fetch(url, { headers: { "Content-Type": "application/json", "X-Seal-Token": token }, signal });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Seal /subscriptions failed (${res.status}): ${text}`);
    }
    const json = await res.json();
    if (Array.isArray(json?.payload)) results.push(...json.payload);
    if (!json?.payload?.length) break; // no more pages
  }
  return results;
}

/**
 * GET /subscription?id=123
 * Full subscription details payload (including addresses, attempts, etc.)
 */
export async function getSubscriptionById({ token, id, signal }) {
  const url = `${BASE}/subscription?id=${encodeURIComponent(id)}`;
  const res = await fetch(url, { headers: { "Content-Type": "application/json", "X-Seal-Token": token }, signal });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Seal /subscription failed (${res.status}): ${text}`);
  }
  return res.json(); // { success, payload: {...} }
}
