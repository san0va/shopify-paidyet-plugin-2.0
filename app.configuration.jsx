// app/routes/app.configuration.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Standalone merchant configuration page.
//
// Req 5.2.5  — Payment apps must be STANDALONE (not embedded in Shopify Admin)
// Req 5.2.7  — After setup, redirect merchant back to Shopify admin using:
//              https://{shop}.myshopify.com/services/payments_partners/gateways/{api_key}/settings
//
// This page is NOT wrapped in App Bridge — it is a plain page served by our
// app that merchants are redirected to for gateway configuration.
// ─────────────────────────────────────────────────────────────────────────────

import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import { authenticate }   from "../shopify.server";

// ── Loader: read current config from session/env ──────────────────────────

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  // Read any stored merchant-specific overrides here if you support them
  return json({
    shop:        session.shop,
    apiKey:      process.env.SHOPIFY_API_KEY,
    environment: process.env.PAIDYET_ENVIRONMENT ?? "sandbox",
    configured:  Boolean(process.env.PAIDYET_MERCHANT_ID),
  });
}

// ── Action: save config and redirect back to Shopify admin ──────────────────

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData    = await request.formData();
  const testMode    = formData.get("testMode") === "on";

  // In a real implementation, persist merchant-specific settings here.
  // e.g. update a MerchantConfig table in Prisma.

  // Req 5.2.7 — redirect merchant back to Shopify admin settings URL
  const shop   = session.shop;
  const apiKey = process.env.SHOPIFY_API_KEY;
  return redirect(
    `https://${shop}/services/payments_partners/gateways/${apiKey}/settings`
  );
}

// ── UI ───────────────────────────────────────────────────────────────────────

export default function ConfigurationPage() {
  const { shop, environment, configured } = useLoaderData();

  return (
    <div style={{ maxWidth: 600, margin: "48px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>PaidYET Gateway — Configuration</h1>
      <p style={{ color: "#6b7280" }}>
        Configure your PaidYET payment gateway settings below.
        After saving, you will be returned to the Shopify payments settings page.
      </p>

      {!configured && (
        <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 6, padding: 16, marginBottom: 24 }}>
          ⚠️ Gateway credentials are not yet configured. Please contact your administrator.
        </div>
      )}

      <Form method="post">
        <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 24, marginBottom: 24 }}>
          <legend style={{ fontWeight: 600, padding: "0 8px" }}>Environment</legend>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            {/* Req 5.2.11 — test mode must be available */}
            <input
              type="checkbox"
              name="testMode"
              defaultChecked={environment === "sandbox"}
            />
            Enable Test Mode (sandbox)
          </label>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 8 }}>
            In test mode, use sandbox card numbers. No real charges are made.
          </p>
        </fieldset>

        <button
          type="submit"
          style={{
            background: "#008060", color: "#fff",
            border: "none", borderRadius: 6,
            padding: "12px 24px", fontSize: 16,
            cursor: "pointer", fontWeight: 600,
          }}
        >
          Save and Return to Shopify
        </button>
      </Form>
    </div>
  );
}
