// Provenance Agent — an x402-gated endpoint that returns web search results or content credentials per paid call.
//
// This is the FIRST thing to get working end-to-end. If `curl` against /provenance returns
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
import rateLimit from "express-rate-limit";
import pino from "pino";
import { z } from "zod";
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { ALGORAND_TESTNET_CAIP2, USDC_TESTNET_ASA_ID } from "@x402/avm";
import { createC2pa } from 'c2pa-node';

const logger = pino({ level: process.env.LOG_LEVEL || "info", name: "provenance-agent" });

function sendProblem(res: express.Response, status: number, title: string, detail: string) {
  res
    .status(status)
    .type("application/problem+json")
    .json({ type: "about:blank", title, status, detail });
}

const app = express();
app.use(express.json());
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => sendProblem(res, 429, "Too Many Requests", "Rate limit exceeded, try again shortly."),
  })
);
const PORT = Number(process.env.PORT) || 4021;

if (!process.env.PROVENANCE_AGENT_ALGO_ADDRESS) {
  logger.warn(
    "PROVENANCE_AGENT_ALGO_ADDRESS is not set in .env — payments have nowhere to settle. Set it before testing the payment flow."
  );
}

// --- 1. Declare which routes cost money, how much, and where payment goes ---
const routes = {
  "POST /provenance": {
    accepts: {
      scheme: "exact",
      network: "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=",
      payTo: process.env.PROVENANCE_AGENT_ALGO_ADDRESS ?? "",
      price: "$0.01",
      extra: { asset: USDC_TESTNET_ASA_ID }, // pay in testnet USDC, not native ALGO
    },
    description: "Live web search results, pay-per-query",
  },
};

// --- 2. Wire up the facilitator + resource server that verify/settle payments ---
const facilitatorClient = new HTTPFacilitatorClient({ url: process.env.FACILITATOR_URL });
const server = new x402ResourceServer(facilitatorClient);
const serverScheme = new ExactAvmScheme();
server.register("algorand:*", serverScheme);

app.use(
  paymentMiddleware(routes, server)
);

const ProvenanceBodySchema = z
  .object({
    query: z.string().min(1).optional(),
    q: z.string().min(1).optional(),
  })
  .passthrough();

function isImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    return pathname.endsWith('.jpg') ||
           pathname.endsWith('.jpeg') ||
           pathname.endsWith('.png') ||
           pathname.endsWith('.webp') ||
           pathname.endsWith('.tiff') ||
           pathname.endsWith('.dng') ||
           pathname.endsWith('.gif');
  } catch {
    return false;
  }
}

// --- 3. The actual handler only runs once payment has settled ---
app.post("/provenance", async (req, res) => {
  const parsed = ProvenanceBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, "rejected malformed /provenance body");
    sendProblem(res, 400, "Invalid Request Body", parsed.error.issues.map((i) => i.message).join("; "));
    return;
  }

  const query = String(parsed.data.query || parsed.data.q || req.query.q || "");
  logger.info({ query }, "/provenance request received");
  if (!query) {
    sendProblem(res, 400, "Missing Parameter", "Missing query/q parameter");
    return;
  }

  if (isImageUrl(query)) {
    try {
      logger.info({ query }, "image URL detected, attempting download");
      const fetchResp = await fetch(query);
      if (!fetchResp.ok) {
        throw new Error(`Failed to download image: ${fetchResp.status} ${fetchResp.statusText}`);
      }
      const arrayBuffer = await fetchResp.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);

      // Determine mimeType
      const parsedUrl = new URL(query);
      const ext = parsedUrl.pathname.split('.').pop()?.toLowerCase() || '';
      let mimeType = 'image/jpeg';
      if (ext === 'png') mimeType = 'image/png';
      else if (ext === 'webp') mimeType = 'image/webp';
      else if (ext === 'dng') mimeType = 'image/dng';
      else if (ext === 'tiff') mimeType = 'image/tiff';

      logger.info({ mimeType }, "validating C2PA manifest for image");
      const c2pa = createC2pa();
      const manifestStore = await c2pa.read({
        buffer: imageBuffer,
        mimeType: mimeType
      });

      if (manifestStore && manifestStore.active_manifest) {
        const activeManifest = manifestStore.active_manifest;
        logger.info({ title: activeManifest.title }, "valid C2PA manifest found");

        // Extract creator
        let creator = "Unknown";
        const creativeWorkAssertion = activeManifest.assertions?.find(a =>
          a.label === 'stds.schema-org.CreativeWork' || a.label === 'st.schema.creativework'
        );
        if (creativeWorkAssertion?.data?.author?.[0]?.name) {
          creator = creativeWorkAssertion.data.author[0].name;
        } else if (activeManifest.signature_info?.issuer) {
          creator = activeManifest.signature_info.issuer;
        }

        // Extract edit history actions
        const actionsAssertion = activeManifest.assertions?.find(a => a.label === 'c2pa.actions');
        const editHistory = actionsAssertion?.data?.actions?.map((act: any) => act.action) || [];

        // Detect AI generation
        const isAI = /ai|generative|synthetic|firefly|dall-e|midjourney|openai|stable-diffusion/i.test(activeManifest.claim_generator || '') ||
                     actionsAssertion?.data?.actions?.some((act: any) => /synthetic|ai|generative/i.test(act.action || '')) || false;

        res.json({
          query,
          verificationMethod: "cryptographic",
          results: {
            title: activeManifest.title || "Image",
            creator,
            claimGenerator: activeManifest.claim_generator || "Unknown",
            signatureIssuer: activeManifest.signature_info?.issuer || "Unknown",
            signatureTime: activeManifest.signature_info?.time || "Unknown",
            isAIGenerated: isAI,
            editHistory
          }
        });
        return;
      } else {
        logger.info("no C2PA manifest found in image, falling back to Tavily search");
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, "C2PA validation failed, falling back to Tavily search");
    }
  }

  // Fallback to Tavily search (inferred)
  logger.info({ query }, "performing Tavily search");
  try {
    const results = await mockSearch(query);
    res.json({
      query,
      verificationMethod: "inferred",
      results
    });
  } catch (err: any) {
    logger.error({ err: err.message }, "search failed");
    sendProblem(res, 500, "Internal Server Error", err.message);
  }
});

async function mockSearch(query: string) {
  if (!process.env.TAVILY_API_KEY) {
    logger.warn("TAVILY_API_KEY is not configured — falling back to mock results.");
    return [
      {
        title: `Placeholder result for "${query}"`,
        snippet: "Swap mockSearch() for a real Tavily/SerpAPI call here. Set TAVILY_API_KEY to get real results.",
        url: "https://example.com",
      },
    ];
  }
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      max_results: 5,
      search_depth: "basic",
    }),
  });
  if (!response.ok) throw new Error(`Tavily API error: ${response.status}`);
  const data = await response.json();
  return data.results.map((r: any) => ({
    title: r.title,
    snippet: r.content,
    url: r.url,
  }));
}

async function registerService() {
  const routeKey = "POST /provenance";
  const accepts = routes[routeKey].accepts;
  try {
    const registryUrl = process.env.REGISTRY_URL || "http://localhost:4025";
    const host = process.env.HOST || "localhost";
    const response = await fetch(`${registryUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resourceUrl: `http://${host}:${PORT}/provenance`,
        tags: ["provenance"],
        accepts: [accepts],
        schema: {
          description: routes[routeKey].description,
          input: { query: "string" },
          output: {
            query: "string",
            verificationMethod: "string",
            results: "any"
          }
        }
      })
    });
    if (response.ok) {
      logger.info("successfully registered to Local Bazaar Registry");
    } else {
      logger.warn({ statusText: response.statusText }, "registration failed");
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, "registry registration failed");
  }
}

app.listen(PORT, () => {
  logger.info(`listening on :${PORT} — POST /provenance is x402-gated at $0.01`);
  registerService();
});
