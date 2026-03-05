// app/routes/api.capture_session.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Handles: POST /api/capture_session
// Called by Shopify when a merchant captures an authorised payment.
// ─────────────────────────────────────────────────────────────────────────────

import { json }      from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";
import { captureTransaction, PaidYETError } from "../payments-api/paidyet.server";
import {
  resolveCaptureSession,
  rejectCaptureSession,
} from "../payments-api/shopify-payments-graphql.server";

const prisma = new PrismaClient();

export async function action({ request }) {
  const { payload, graphql } = await authenticate.payment(request);
  const { id, gid, payment_id, amount } = payload;

  const paymentRecord = await prisma.paymentSession.findFirst({
    where: { id: payment_id },
  });

  if (!paymentRecord?.paidYetTxId) {
    await rejectCaptureSession(graphql, {
      id:              gid,
      reasonCode:      "PROCESSING_ERROR",
      merchantMessage: "Original authorisation not found",
    });
    return json({ acknowledged: true });
  }

  try {
    await captureTransaction({
      transactionId: paymentRecord.paidYetTxId,
      amount:        String(amount),
    });
    await resolveCaptureSession(graphql, { id: gid });
  } catch (err) {
    await rejectCaptureSession(graphql, {
      id:              gid,
      reasonCode:      "PROCESSING_ERROR",
      merchantMessage: err.message,
    });
  }

  return json({ acknowledged: true });
}
