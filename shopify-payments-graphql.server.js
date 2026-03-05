// app/payments-api/shopify-payments-graphql.server.js
// ─────────────────────────────────────────────────────────────────────────────
// Wrappers around the Shopify Payments Apps GraphQL API.
//
// Req 1.1.7  — Must use the Payments Apps API (not REST payment resources)
// Req 2.2.4  — GraphQL Admin API required for all new public apps (Apr 2025)
// Req 5.2.3  — Must resolve/reject the payment session back to Shopify
// ─────────────────────────────────────────────────────────────────────────────

// ── GraphQL mutations ────────────────────────────────────────────────────────

const PAYMENT_SESSION_RESOLVE = `#graphql
  mutation PaymentSessionResolve($id: ID!) {
    paymentSessionResolve(id: $id) {
      paymentSession {
        id
        state { ... on PaymentSessionStateResolved { code } }
      }
      userErrors { field message code }
    }
  }
`;

const PAYMENT_SESSION_REJECT = `#graphql
  mutation PaymentSessionReject($id: ID!, $reason: PaymentSessionRejectionReasonInput!) {
    paymentSessionReject(id: $id, reason: $reason) {
      paymentSession {
        id
        state { ... on PaymentSessionStateRejected { code reason { code } } }
      }
      userErrors { field message code }
    }
  }
`;

const PAYMENT_SESSION_REDIRECT = `#graphql
  mutation PaymentSessionRedirect($id: ID!, $redirectUrl: URL!) {
    paymentSessionRedirect(id: $id, redirectUrl: $redirectUrl) {
      paymentSession {
        id
        nextAction { action redirectUrl }
      }
      userErrors { field message code }
    }
  }
`;

const REFUND_SESSION_RESOLVE = `#graphql
  mutation RefundSessionResolve($id: ID!) {
    refundSessionResolve(id: $id) {
      refundSession {
        id
        state { ... on RefundSessionStateResolved { code } }
      }
      userErrors { field message code }
    }
  }
`;

const REFUND_SESSION_REJECT = `#graphql
  mutation RefundSessionReject($id: ID!, $reason: RefundSessionRejectionReasonInput!) {
    refundSessionReject(id: $id, reason: $reason) {
      refundSession {
        id
        state { ... on RefundSessionStateRejected { code reason { code } } }
      }
      userErrors { field message code }
    }
  }
`;

const CAPTURE_SESSION_RESOLVE = `#graphql
  mutation CaptureSessionResolve($id: ID!) {
    captureSessionResolve(id: $id) {
      captureSession {
        id
        state { ... on CaptureSessionStateResolved { code } }
      }
      userErrors { field message code }
    }
  }
`;

const CAPTURE_SESSION_REJECT = `#graphql
  mutation CaptureSessionReject($id: ID!, $reason: CaptureSessionRejectionReasonInput!) {
    captureSessionReject(id: $id, reason: $reason) {
      captureSession {
        id
        state { ... on CaptureSessionStateRejected { code reason { code } } }
      }
      userErrors { field message code }
    }
  }
`;

const VOID_SESSION_RESOLVE = `#graphql
  mutation VoidSessionResolve($id: ID!) {
    voidSessionResolve(id: $id) {
      voidSession {
        id
        state { ... on VoidSessionStateResolved { code } }
      }
      userErrors { field message code }
    }
  }
`;

const VOID_SESSION_REJECT = `#graphql
  mutation VoidSessionReject($id: ID!, $reason: VoidSessionRejectionReasonInput!) {
    voidSessionReject(id: $id, reason: $reason) {
      voidSession {
        id
        state { ... on VoidSessionStateRejected { code reason { code } } }
      }
      userErrors { field message code }
    }
  }
`;

// ── Helper: execute and check userErrors ─────────────────────────────────────

async function runMutation(graphql, mutation, variables) {
  const res  = await graphql(mutation, { variables });
  const body = await res.json();
  const key  = Object.keys(body.data ?? {})[0];
  const result = body.data?.[key];

  if (result?.userErrors?.length) {
    throw new Error(result.userErrors.map((e) => e.message).join("; "));
  }
  return result;
}

// ── Exported helpers ─────────────────────────────────────────────────────────

/**
 * Redirect buyer to PaidYET-hosted payment page (offsite flow).
 * Req 5.2.3 — checkout → payment page → back to Shopify order confirmation.
 */
export async function redirectPaymentSession(graphql, { id, redirectUrl }) {
  return runMutation(graphql, PAYMENT_SESSION_REDIRECT, { id, redirectUrl });
}

/**
 * Mark a payment session as successfully resolved.
 */
export async function resolvePaymentSession(graphql, { id }) {
  return runMutation(graphql, PAYMENT_SESSION_RESOLVE, { id });
}

/**
 * Mark a payment session as rejected (declined / error).
 * reasonCode: "PROCESSING_ERROR" | "RISKY" | "PAYMENT_METHOD_DECLINE" | etc.
 */
export async function rejectPaymentSession(graphql, { id, reasonCode, merchantMessage }) {
  return runMutation(graphql, PAYMENT_SESSION_REJECT, {
    id,
    reason: { code: reasonCode, merchantMessage: merchantMessage ?? reasonCode },
  });
}

export async function resolveRefundSession(graphql, { id }) {
  return runMutation(graphql, REFUND_SESSION_RESOLVE, { id });
}

export async function rejectRefundSession(graphql, { id, reasonCode, merchantMessage }) {
  return runMutation(graphql, REFUND_SESSION_REJECT, {
    id,
    reason: { code: reasonCode, merchantMessage: merchantMessage ?? reasonCode },
  });
}

export async function resolveCaptureSession(graphql, { id }) {
  return runMutation(graphql, CAPTURE_SESSION_RESOLVE, { id });
}

export async function rejectCaptureSession(graphql, { id, reasonCode, merchantMessage }) {
  return runMutation(graphql, CAPTURE_SESSION_REJECT, {
    id,
    reason: { code: reasonCode, merchantMessage: merchantMessage ?? reasonCode },
  });
}

export async function resolveVoidSession(graphql, { id }) {
  return runMutation(graphql, VOID_SESSION_RESOLVE, { id });
}

export async function rejectVoidSession(graphql, { id, reasonCode, merchantMessage }) {
  return runMutation(graphql, VOID_SESSION_REJECT, {
    id,
    reason: { code: reasonCode, merchantMessage: merchantMessage ?? reasonCode },
  });
}
