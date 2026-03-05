// app/routes/webhooks.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Mandatory webhook handler.
// All Shopify App Store apps must implement these three GDPR webhooks:
//   • customers/data_request
//   • customers/redact
//   • shop/redact
// Plus app/uninstalled for cleanup.
// ─────────────────────────────────────────────────────────────────────────────

import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function action({ request }) {
  const { topic, shop, session, payload } =
    await authenticate.webhook(request);

  switch (topic) {
    // ── App uninstalled: clean up session data ────────────────────────────
    case "APP_UNINSTALLED":
      if (session) {
        await prisma.session.deleteMany({ where: { shop } });
      }
      break;

    // ── GDPR: customer data request ───────────────────────────────────────
    // Respond within 30 days. Send the customer's data to the merchant.
    case "CUSTOMERS_DATA_REQUEST":
      // In production: queue a job to email the customer's data to the merchant.
      // For now, log the request.
      console.log("CUSTOMERS_DATA_REQUEST for shop:", shop, "customer:", payload.customer?.id);
      break;

    // ── GDPR: erase customer data ─────────────────────────────────────────
    case "CUSTOMERS_REDACT":
      // Delete any PII tied to this customer from our DB.
      // PaymentSession records don't store PII, so nothing to delete here.
      console.log("CUSTOMERS_REDACT for shop:", shop);
      break;

    // ── GDPR: erase all shop data (merchant uninstalled) ──────────────────
    case "SHOP_REDACT":
      await prisma.paymentSession.deleteMany({ where: { merchantShop: shop } });
      await prisma.refundSession.deleteMany({ where: { merchantShop: shop } });
      break;

    default:
      throw new Response("Unhandled webhook topic", { status: 404 });
  }

  return new Response("OK", { status: 200 });
}
