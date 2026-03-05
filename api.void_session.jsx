// app/routes/api.void_session.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Handles: POST /api/void_session
// Called by Shopify when a merchant voids an authorised (uncaptured) payment.
// ─────────────────────────────────────────────────────────────────────────────

import { json }         from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";
import { voidTransaction, PaidYETError } from "../payments-api/paidyet.server";
import {
  resolveVoidSession,
  rejectVoidSession,
} from "../payments-api/shopify-payments-graphql.server";

const prisma = new PrismaClient();

export async function action({ request }) {
  const { payload, graphql } = await authenticate.payment(request);
  const { id, gid, payment_id } = payload;

  const paymentRecord = await prisma.paymentSession.findFirst({
    where: { id: payment_id },
  });

  if (!paymentRecord?.paidYetTxId) {
    await rejectVoidSession(graphql, {
      id:              gid,
      reasonCode:      "PROCESSING_ERROR",
      merchantMessage: "Original authorisation not found",
    });
    return json({ acknowledged: true });
  }

  try {
    await voidTransaction({ transactionId: paymentRecord.paidYetTxId });
    await resolveVoidSession(graphql, { id: gid });
  } catch (err) {
    await rejectVoidSession(graphql, {
      id:              gid,
      reasonCode:      "PROCESSING_ERROR",
      merchantMessage: err.message,
    });
  }

  return json({ acknowledged: true });
}
