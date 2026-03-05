// app/payments-api/paidyet.server.js
// ─────────────────────────────────────────────────────────────────────────────
// Pure PaidYET REST API v3 client — no Shopify coupling.
//
// Responsibilities:
//   • Obtain + cache bearer tokens (auto-refresh on 401)
//   • Process sale / auth-only transactions
//   • Capture, void, refund
//   • Expose a test-mode flag (Req 5.2.11)
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URLS = {
  production: "https://api.paidyet.com/v3",
  sandbox:    "https://api.sandbox-paidyet.com/v3",
};

// Simple in-memory bearer cache (one token per environment)
// In production, use Redis or a DB row instead.
let _bearerCache = { token: null, expiresAt: 0 };

// ── Token management ─────────────────────────────────────────────────────────

async function obtainBearerToken() {
  const env = process.env.PAIDYET_ENVIRONMENT === "production"
    ? "production"
    : "sandbox";
  const baseUrl = BASE_URLS[env];

  const res = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      merchantId: process.env.PAIDYET_MERCHANT_ID,
      apiKey:     process.env.PAIDYET_API_KEY,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PaidYET auth failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  // PaidYET returns: { token, expiresIn (seconds) }
  _bearerCache = {
    token:     data.token,
    expiresAt: Date.now() + (data.expiresIn - 60) * 1000, // 60 s buffer
  };
  return _bearerCache.token;
}

async function getBearerToken() {
  if (_bearerCache.token && Date.now() < _bearerCache.expiresAt) {
    return _bearerCache.token;
  }
  return obtainBearerToken();
}

// ── Low-level request helper ──────────────────────────────────────────────────

async function paidYetRequest(method, path, body, retryOnce = true) {
  const env = process.env.PAIDYET_ENVIRONMENT === "production"
    ? "production"
    : "sandbox";
  const baseUrl  = BASE_URLS[env];
  const token    = await getBearerToken();

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  // Auto-refresh on 401
  if (res.status === 401 && retryOnce) {
    _bearerCache = { token: null, expiresAt: 0 };
    return paidYetRequest(method, path, body, false);
  }

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Process a sale or auth-only transaction.
 *
 * @param {object} params
 * @param {string} params.token          - Tokenized card from PaidYET widget
 * @param {string} params.amount         - Decimal string, e.g. "99.99"
 * @param {string} params.currency       - ISO 4217, e.g. "USD"
 * @param {string} params.orderId        - Shopify order / payment-session ID
 * @param {boolean} params.authOnly      - true → authorize only (no capture)
 * @param {boolean} params.test          - true → use sandbox (Req 5.2.11)
 * @param {object}  params.billingAddress
 * @param {object}  params.customer
 * @returns {{ transactionId, status, message }}
 */
export async function processPayment({
  token,
  amount,
  currency,
  orderId,
  authOnly = false,
  billingAddress = {},
  customer = {},
}) {
  const { ok, status, data } = await paidYetRequest("POST", "/transaction", {
    token,
    amount,
    currency,
    orderId,
    transactionType: authOnly ? "auth" : "sale",
    billingAddress,
    customer,
  });

  if (!ok) {
    throw new PaidYETError(data?.message ?? "Transaction failed", status, data);
  }

  return {
    transactionId: data.transactionId,
    status:        data.status,   // "approved" | "declined" | "error"
    message:       data.message,
  };
}

/**
 * Capture a previously authorised transaction.
 */
export async function captureTransaction({ transactionId, amount }) {
  const { ok, status, data } = await paidYetRequest(
    "PUT",
    `/transaction/capture/${transactionId}`,
    { amount }
  );
  if (!ok) throw new PaidYETError(data?.message ?? "Capture failed", status, data);
  return data;
}

/**
 * Void a transaction in the current batch.
 */
export async function voidTransaction({ transactionId }) {
  const { ok, status, data } = await paidYetRequest(
    "PUT",
    `/transaction/void/${transactionId}`
  );
  if (!ok) throw new PaidYETError(data?.message ?? "Void failed", status, data);
  return data;
}

/**
 * Refund a settled transaction.
 * Req 1.1.15 — refunds must go through the original processor (PaidYET).
 */
export async function refundTransaction({ transactionId, amount }) {
  const { ok, status, data } = await paidYetRequest(
    "POST",
    `/transaction/refund/${transactionId}`,
    { amount }
  );
  if (!ok) throw new PaidYETError(data?.message ?? "Refund failed", status, data);
  return data;
}

/**
 * Retrieve transaction details.
 */
export async function getTransaction({ transactionId }) {
  const { ok, status, data } = await paidYetRequest(
    "GET",
    `/transaction/${transactionId}`
  );
  if (!ok) throw new PaidYETError(data?.message ?? "Lookup failed", status, data);
  return data;
}

// ── Custom error class ────────────────────────────────────────────────────────

export class PaidYETError extends Error {
  constructor(message, httpStatus, responseData) {
    super(message);
    this.name         = "PaidYETError";
    this.httpStatus   = httpStatus;
    this.responseData = responseData;
  }
}
