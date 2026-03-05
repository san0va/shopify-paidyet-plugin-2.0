// app/shopify.server.js
// ─────────────────────────────────────────────────────────────────────────────
// Central Shopify app configuration.
// Uses @shopify/shopify-app-remix — the official Remix adapter.
//
// Key compliance points addressed here:
//   • Req 1.1.1  — session tokens (no third-party cookies / localStorage)
//   • Req 2.3.2  — OAuth fires immediately on install
//   • Req 2.3.3  — redirects to app UI after install
//   • Req 3.1.1  — TLS enforced by Shopify's hosting requirements
//   • Req 5.2.4  — no Admin API scopes (payments apps must not request them)
// ─────────────────────────────────────────────────────────────────────────────

import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const shopify = shopifyApp({
  apiKey:    process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  apiVersion: ApiVersion.January25,        // Always pin to a recent stable version
  scopes:    [],                            // Req 5.2.4 — empty: payments apps use
                                            // ONLY the Payments Apps GraphQL API
  appUrl:    process.env.SHOPIFY_APP_URL,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true, // session-token auth (Req 1.1.1)
  },
  hooks: {
    afterAuth: async ({ session }) => {
      // Register mandatory webhooks immediately after OAuth (Req 2.3.2)
      shopify.registerWebhooks({ session });
    },
  },
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate             = shopify.authenticate;
export const unauthenticated          = shopify.unauthenticated;
export const login                    = shopify.login;
export const registerWebhooks         = shopify.registerWebhooks;
export const sessionStorage           = shopify.sessionStorage;
