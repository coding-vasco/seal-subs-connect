# Seal Subscriptions Proxy (Render)

This service lets Shopify Flow fetch **subscription details** from Seal Subscriptions **right after Order created**.

## Endpoint

**POST** `/api/subscription-lookup`

**Request body (from Shopify Flow “Send HTTP request”)**
```json
{
  "shopDomain": "{{shop.myshopifyDomain}}",
  "orderId": "{{order.id}}",
  "orderName": "{{order.name}}",
  "customerId": "{{order.customer.id}}",
  "email": "{{order.email}}"
}
