// Search Agent — an x402-gated endpoint that returns web search results per paid call.
//
// This is the FIRST thing to get working end-to-end. If `curl` against /search returns
// 402 without payment, and 200 with a valid X-PAYMENT header, the core loop is proven —
// everything else in this project (Summarizer, Fact-Checker, orchestrator, frontend)
// is a repeat of this same pattern.
//
// NOTE: import paths/exact function names are taken from GoPlausible's official docs
// (x402-avm-express-examples.md) as of Aug 2026. Double-check against
// https://x402.goplausible.xyz/ if `npm install` or these imports don't resolve —
// this SDK is actively evolving.

import "dotenv/config";
import express from "express";
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { ALGORAND_TESTNET_CAIP2, USDC_TESTNET_ASA_ID } from "@x402/avm";

const app = express();
const PORT = Number(process.env.PORT) || 4021;

if (!process.env.SEARCH_AGENT_ALGO_ADDRESS) {
  console.warn(
    "[search-agent] WARNING: SEARCH_AGENT_ALGO_ADDRESS is not set in .env — " +
      "payments have nowhere to settle. Set it before testing the payment flow."
  );
}

// --- 1. Declare which routes cost money, how much, and where payment goes ---
const routes = {
  "GET /search": {
    accepts: {
      scheme: "exact",
      network: "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=",
      payTo: process.env.SEARCH_AGENT_ALGO_ADDRESS ?? "",
      price: "$0.01",
      extra: { asset: USDC_TESTNET_ASA_ID }, // pay in testnet USDC, not native ALGO
    },
    description: "Live web search results, pay-per-query",
  },
};

// --- 2. Wire up the facilitator + resource server that verify/settle payments ---
const facilitatorClient = new HTTPFacilitatorClient({ url: process.env.FACILITATOR_URL });
const server = new x402ResourceServer(facilitatorClient);
server.register("algorand:*", new ExactAvmScheme());

app.use(
  paymentMiddleware(routes, server)
);

// --- 3. The actual handler only runs once payment has settled ---
app.get("/search", async (req, res) => {
  const query = String(req.query.q ?? "");
  const results = await mockSearch(query);
  res.json({ query, results });
});

async function mockSearch(query: string) {
  // TODO: replace with a real call to Tavily (https://tavily.com) or SerpAPI once
  // the payment flow is confirmed working. Keep the interface the same:
  // return an array of { title, snippet, url }.
  return [
    {
      title: `Placeholder result for "${query}"`,
      snippet: "Swap mockSearch() for a real Tavily/SerpAPI call here.",
      url: "https://example.com",
    },
  ];
}

app.listen(PORT, () => {
  console.log(`[search-agent] listening on :${PORT} — GET /search is x402-gated at $0.01`);
});
