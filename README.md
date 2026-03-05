# PaidYET Payment Gateway for Shopify — v2.0

A Shopify **Payments App** (offsite extension) that integrates the PaidYET gateway
using the **Shopify Payments Apps API** — the only permitted approach for payment
apps listed in the Shopify App Store.

---

## Architecture overview

```
Buyer at Shopify Checkout
        │  selects "PaidYET" payment method
        ▼
POST /api/payment_session          ← Shopify calls our app
  • Persist PaymentSession in DB
  • Build PaidYET paypage URL (amount, currency, buyer name)
  • Call paymentSessionRedirect mutation → Shopify redirects buyer
        │
        ▼
PaidYET Hosted Payment Page        ← buyer enters card details
        │  payment processed
        ▼
POST /api/payment_callback         ← PaidYET calls our app
  • Verify HMAC signature
  • Verify amount/currency match
  • Call paymentSessionResolve  (approved)
    OR  paymentSessionReject    (declined/error)
        │
        ▼
Shopify Order Confirmation Page    ← buyer lands here on success
  OR  Back to Shopify Checkout     ← buyer lands here on failure (cancel_url)
```

---

## Prerequisites

- Node.js ≥ 18.20.0
- PaidYET merchant account with API credentials

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
# Edit .env with your real credentials
```

### 3. Set up the database

```bash
npx prisma migrate dev --name init
```

### 4. Link the app to your Partner Dashboard

```bash
npm run config:link
# Follow the prompts — this sets client_id in shopify.app.toml
```

### 5. Start development server

```bash
npm run dev
# Shopify CLI will open a tunnel and register the app automatically
```

---

## Payment flow (offsite extension)

1. Merchant installs the app through the Shopify payment providers page.
2. Merchant is redirected to `/app/configuration` to enable test mode and save.
3. App redirects merchant back to:
   `https://{shop}.myshopify.com/services/payments_partners/gateways/{api_key}/settings`
4. Buyer at checkout selects "PaidYET". Shopify POSTs to `/api/payment_session`.
5. App redirects buyer to PaidYET-hosted payment page (includes amount, currency, cancel URL).
6. PaidYET processes payment, POSTs result to `/api/payment_callback`.
7. App resolves or rejects the Shopify payment session via GraphQL.
8. Buyer is returned to Shopify order confirmation (resolved) or checkout (rejected/abandoned).

---

## Test mode (Shopify Req 5.2.11)

Set `PAIDYET_ENVIRONMENT=sandbox` and enable **Test Mode** on the configuration page.

| Card Number         | Result        |
|---------------------|---------------|
| 4000100011112224    | Approved      |
| 4000300011112220    | Declined      |
| 4000301311112225    | CVV Failure   |

---

## Security

- All callbacks verified with HMAC-SHA256 (`X-PaidYET-Signature` header).
- Bearer tokens never stored client-side; auto-refreshed on expiry.
- TLS required in production (Shopify Req 3.1.1) — enforce via your hosting provider.
- No Admin API scopes requested (Shopify Req 5.2.4).
- Idempotency: duplicate POSTs to `/api/payment_session` are handled by `upsert`.

---

## Production checklist

- [ ] Set `PAIDYET_ENVIRONMENT=production`
- [ ] Set `NODE_ENV=production`
- [ ] Deploy behind HTTPS (TLS certificate — Shopify Req 3.1.1)
- [ ] Replace SQLite `DATABASE_URL` with a production database
- [ ] Configure `PAIDYET_WEBHOOK_SECRET` and validate signatures
- [ ] Submit screencasts of payment flow for all supported browsers (Shopify Req 5.2.2)
- [ ] Provide test store + credentials in App Store submission (Shopify Req 5.2.1)
- [ ] Sign Shopify revenue share agreement (Shopify Req 5.2.8)
- [ ] Ensure app name matches legal business name — no marketing copy (Shopify Req 5.2.13)

---

## Support

- PaidYET: support@paidyet.com | https://paidyet.readme.io
- Shopify Payments Apps: https://shopify.dev/docs/apps/build/payments
