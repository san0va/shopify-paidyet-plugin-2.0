// app/routes/api.refund_session.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Handles: POST /api/refund_session
//
// Shopify calls this URL when a merchant initiates a refund.
// Req 1.1.15 — refunds must go through the original processor (PaidYET).
// ─────────────────────────────────────────────────────────────────────────────

import { json }      from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";
import { refundTransaction, PaidYETError } from "../payments-api/paidyet.server";
import {
  resolveRefundSession,
  rejectRefundSession,
} from "../payments-api/shopify-payments-graphql.server";

const prisma = new PrismaClient();

export async function action({ request }) {
  const { payload, graphql } = await authenticate.payment(request);

  const { id, gid, payment_id, amount, currency, test } = payload;

  // Look up the original payment to get the PaidYET transaction ID
  const paymentRecord = await prisma.paymentSession.findFirst({
    where: { id: payment_id },
  });

  if (!paymentRecord?.paidYetTxId) {
    await rejectRefundSession(graphql, {
      id:              gid,
      reasonCode:      "PROCESSING_ERROR",
      merchantMessage: "Original transaction not found",
    });
    return json({ acknowledged: true });
  }

  try {
    await refundTransaction({
      transactionId: paymentRecord.paidYetTxId,
      amount:        String(amount),
    });

    await resolveRefundSession(graphql, { id: gid });

    await prisma.refundSession.upsert({
      where:  { gid },
      create: { id, gid, paymentId: payment_id, amount: String(amount), currency, merchantShop: paymentRecord.merchantShop, status: "RESOLVED" },
      update: { status: "RESOLVED" },
    });
  } catch (err) {
    const reasonCode = err instanceof PaidYETError ? "PROCESSING_ERROR" : "PROCESSING_ERROR";
    await rejectRefundSession(graphql, {
      id:              gid,
      reasonCode,
      merchantMessage: err.message,
    });
  }

  return json({ acknowledged: true });
}
