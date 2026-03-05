// app/routes/api.payment_callback.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Handles: POST /api/payment_callback
//
// PaidYET calls this URL after attempting to process the payment.
// We resolve or reject the Shopify payment session and then redirect the
// buyer to Shopify's order confirmation page.
//
// Compliance:
//   Req 5.2.3  — buyer redirected back to Shopify order confirmation
//   Req 5.2.6  — on failure, redirect to cancel_url (back to Shopify checkout)
//   Req 5.2.9  — verify amount/currency match before resolving
// ─────────────────────────────────────────────────────────────────────────────

import { redirect }  from "@remix-run/node";
import { unauthenticated } from "../shopify.server";
import { PrismaClient }    from "@prisma/client";
import {
  resolvePaymentSession,
  rejectPaymentSession,
} from "../payments-api/shopify-payments-graphql.server";
import { verifyPaidYETWebhookSignature } from "../utils/webhook-verification.server";

const prisma = new PrismaClient();

export async function action({ request }) {
  const rawBody = await request.text();

  // ── 1. Verify webhook signature ──────────────────────────────────────────
  // Prevents spoofed callbacks from resolving sessions
  const signature = request.headers.get("X-PaidYET-Signature") ?? "";
  const valid     = verifyPaidYETWebhookSignature(
    rawBody,
    signature,
    process.env.PAIDYET_WEBHOOK_SECRET
  );
  if (!valid) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const { sessionId, transactionId, status, amount, currency } = payload;
  // status: "approved" | "declined" | "error"

  // ── 2. Look up stored session ────────────────────────────────────────────
  const stored = await prisma.paymentSession.findUnique({
    where: { id: sessionId },
  });
  if (!stored) {
    return new Response("Session not found", { status: 404 });
  }

  // Req 5.2.9 — verify amount & currency match what Shopify told us
  if (
    String(amount)   !== stored.amount ||
    String(currency) !== stored.currency
  ) {
    // Mismatch — reject and send buyer back to checkout
    const { graphql } = await unauthenticated.payment(stored.merchantShop);
    await rejectPaymentSession(graphql, {
      id:         stored.gid,
      reasonCode: "PROCESSING_ERROR",
      merchantMessage: "Amount or currency mismatch",
    });
    await prisma.paymentSession.update({
      where: { id: sessionId },
      data:  { status: "REJECTED" },
    });
    return redirect(stored.cancelUrl ?? "https://shopify.com");
  }

  const { graphql } = await unauthenticated.payment(stored.merchantShop);

  if (status === "approved") {
    // ── 3a. Resolve the Shopify payment session ──────────────────────────
    await resolvePaymentSession(graphql, { id: stored.gid });
    await prisma.paymentSession.update({
      where: { id: sessionId },
      data:  { status: "RESOLVED", paidYetTxId: transactionId },
    });

    // Req 5.2.3 — redirect buyer to Shopify order confirmation
    // Shopify provides the return URL as part of the original session payload;
    // here we rely on Shopify's redirect after the session is resolved.
    // (Shopify takes over navigation once the session is resolved.)
    return new Response("OK", { status: 200 });
  } else {
    // ── 3b. Reject the Shopify payment session ───────────────────────────
    const reasonCode = status === "declined"
      ? "PAYMENT_METHOD_DECLINE"
      : "PROCESSING_ERROR";

    await rejectPaymentSession(graphql, {
      id: stored.gid,
      reasonCode,
      merchantMessage: payload.message ?? reasonCode,
    });
    await prisma.paymentSession.update({
      where: { id: sessionId },
      data:  { status: "REJECTED" },
    });

    // Req 5.2.6 — allow buyer to try a different payment method
    return redirect(stored.cancelUrl ?? "https://shopify.com");
  }
}
