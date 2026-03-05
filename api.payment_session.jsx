// app/routes/api.payment_session.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Handles: POST /api/payment_session
//
// Shopify calls this URL when a buyer selects PaidYET at checkout.
// We respond with an HTTP 200 + a redirect URL pointing to the PaidYET-hosted
// payment page (offsite flow).
//
// Compliance checklist:
//   Req 5.2.3  — redirects buyer from Shopify checkout → PaidYET → back
//   Req 5.2.6  — includes cancel_url so buyer can abandon and return
//   Req 5.2.9  — payment page shows same amount/currency/buyer as checkout
//   Req 5.2.11 — test flag propagated so sandbox cards work
//   Req 5.2.12 — no upsells in the payment flow
// ─────────────────────────────────────────────────────────────────────────────

import { json }       from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";
import {
  redirectPaymentSession,
} from "../payments-api/shopify-payments-graphql.server";

const prisma = new PrismaClient();

export async function action({ request }) {
  // Authenticate as a payment extension request (not an embedded-app request)
  const { payload, session, graphql } =
    await authenticate.payment(request);

  const {
    id,           // Shopify GID  — gid://shopify/PaymentSession/…
    gid,
    group,
    amount,
    currency,
    test,         // Req 5.2.11 — true when merchant is in test mode
    kind,         // "sale" | "authorization"
    customer,
    payment_method,
    proposed_at,
    cancel_url,   // Req 5.2.6 — Shopify-provided URL if buyer abandons
  } = payload;

  // ── 1. Persist session for idempotency / later callback ──────────────────
  await prisma.paymentSession.upsert({
    where:  { gid },
    create: {
      id,
      gid,
      group,
      test:         Boolean(test),
      merchantShop: session.shop,
      amount:       String(amount),
      currency,
      cancelUrl:    cancel_url,
      status:       "PENDING",
    },
    update: { status: "PENDING" },
  });

  // ── 2. Build the PaidYET payment-page URL ─────────────────────────────────
  // Req 5.2.9 — pass exact amount, currency, and buyer name
  const paypageSubdomain = process.env.PAIDYET_PAYPAGE_SUBDOMAIN;
  const env              = test ? "sandbox" : "production";

  // The PaidYET hosted payment page accepts query params that pre-fill the form
  // and identify the session so the callback can resolve it.
  const paypageBase  = test
    ? `https://${paypageSubdomain}.sandbox-paidyet.com/pay`
    : `https://${paypageSubdomain}.paidyet.com/pay`;

  const callbackUrl  = `${process.env.SHOPIFY_APP_URL}/api/payment_callback`;
  const paypageUrl   = new URL(paypageBase);
  paypageUrl.searchParams.set("sessionId",   id);
  paypageUrl.searchParams.set("amount",      amount);
  paypageUrl.searchParams.set("currency",    currency);
  paypageUrl.searchParams.set("merchantId",  process.env.PAIDYET_MERCHANT_ID);
  paypageUrl.searchParams.set("callbackUrl", callbackUrl);
  // Cancel URL — Req 5.2.6: buyer can abandon payment and return to checkout
  paypageUrl.searchParams.set("cancelUrl",   cancel_url);
  // Pre-fill buyer name (Req 5.2.9 — match checkout info)
  if (customer?.email)       paypageUrl.searchParams.set("email",     customer.email);
  if (customer?.given_name)  paypageUrl.searchParams.set("firstName", customer.given_name);
  if (customer?.family_name) paypageUrl.searchParams.set("lastName",  customer.family_name);

  // ── 3. Tell Shopify to redirect the buyer there ───────────────────────────
  await redirectPaymentSession(graphql, {
    id:          gid,
    redirectUrl: paypageUrl.toString(),
  });

  // Shopify expects HTTP 200
  return json({ acknowledged: true });
}
