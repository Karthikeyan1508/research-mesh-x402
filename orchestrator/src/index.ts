// Orchestrator — pays the worker agents per call and stitches their results together.
//
// PHASE 3 SCOPE: this file just proves the payment loop against the Search Agent.
// Once `npm run dev -- "some query"` prints real search results (paid for on testnet),
// come back and extend `main()` per Phase 5 in the README: add Fact-Checker + Summarizer
// calls, an LLM planning step, and a final synthesized report.
//
// NOTE: same caveat as the Search Agent — confirm exact import paths against
// https://x402.goplausible.xyz/ before running, this SDK moves fast.

import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pino from "pino";
import { z } from "zod";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactAvmScheme, toClientAvmSigner } from "@x402/avm";
import algosdk from "algosdk";

const logger = pino({ level: process.env.LOG_LEVEL || "info", name: "orchestrator" });

function sendProblem(res: express.Response, status: number, title: string, detail: string) {
  res
    .status(status)
    .type("application/problem+json")
    .json({ type: "about:blank", title, status, detail });
}

type PaymentLogEntry = {
  worker: string;
  url: string;
  txId?: string;
};

type ResearchResult = {
  report: string;
  payments: PaymentLogEntry[];
  trustScore?: number;
  verificationMethod?: string;
  verification?: any;
  translationStatus?: "completed" | "skipped" | "failed";
  translationError?: string;
};

type DiscoveryResource = {
  id: string;
  resourceUrl: string;
  method: string;
  description?: string;
  mimeType?: string;
  accepts: any[];
  tags?: string[];
};

type DiscoveryResponse = {
  items: DiscoveryResource[];
};

// Local reputation database in orchestrator memory
const reputationTracker = new Map<string, { success: number; fail: number; totalLatencyMs: number; count: number }>();

function updateReputation(url: string, latencyMs: number, success: boolean) {
  const current = reputationTracker.get(url) || { success: 0, fail: 0, totalLatencyMs: 0, count: 0 };
  if (success) {
    current.success += 1;
  } else {
    current.fail += 1;
  }
  current.totalLatencyMs += latencyMs;
  current.count += 1;
  reputationTracker.set(url, current);
}

async function discoverAgent(capability: string): Promise<DiscoveryResource[]> {
  try {
    const registryUrl = process.env.REGISTRY_URL || "http://localhost:4025";
    const res = await fetch(`${registryUrl}/discover?capability=${capability}`);
    if (!res.ok) {
      throw new Error(`Registry discovery failed: ${res.statusText}`);
    }
    const data = (await res.json()) as DiscoveryResponse;
    return data.items || [];
  } catch (err: any) {
    logger.warn({ capability, err: err.message }, "discovery failed");
    return [];
  }
}

function selectBestAgent(candidates: DiscoveryResource[], fallbackUrl: string): string {
  if (candidates.length === 0) {
    logger.info({ fallbackUrl }, "no candidates discovered for capability, using fallback");
    return fallbackUrl;
  }

  const scored = candidates.map(c => {
    const url = c.resourceUrl;
    // Bazaar uses price: "$0.005" — strip the $ sign and parse to float, then scale to cents
    const rawPrice = c.accepts?.[0]?.price ?? c.accepts?.[0]?.amount ?? "10000";
    const priceFloat = parseFloat(String(rawPrice).replace(/[^0-9.]/g, ''));
    const price = isNaN(priceFloat) ? 10000 : Math.round(priceFloat * 1000); // scale to integer for scoring

    const rep = reputationTracker.get(url);
    let successRate = 1.0;
    let avgLatencyMs = 200;

    if (rep && rep.count > 0) {
      successRate = rep.success / rep.count;
      avgLatencyMs = rep.totalLatencyMs / rep.count;
    }

    // Lower score is better
    const score = price * (2 - successRate) + (avgLatencyMs * 0.01);
    return { url, score };
  });

  scored.sort((a, b) => a.score - b.score);
  logger.info({ scored }, "discovered candidates ranked");
  return scored[0].url;
}

function buildClient() {
  const privateKey = process.env.ORCHESTRATOR_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "ORCHESTRATOR_PRIVATE_KEY is not set — run scripts/generate-wallets.js and " +
        "copy the orchestrator's mnemonic/key into orchestrator/.env first."
    );
  }

  let privateKeyBase64 = privateKey;
  if (privateKey.includes(" ")) {
    try {
      const account = algosdk.mnemonicToSecretKey(privateKey);
      privateKeyBase64 = Buffer.from(account.sk).toString("base64");
    } catch (e: any) {
      throw new Error(`Failed to parse ORCHESTRATOR_PRIVATE_KEY as mnemonic: ${e.message}`);
    }
  }

  const signer = toClientAvmSigner(privateKeyBase64);
  const client = new x402Client();
  client.register("algorand:*", new ExactAvmScheme(signer));
  return client;
}

async function runLLM(prompt: string, fallbackText: string): Promise<string> {
  const apiKey = process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;

  if (process.env.GEMINI_API_KEY || (process.env.LLM_API_KEY && !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY)) {
    try {
      const key = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text.trim();
      }
    } catch (e: any) {
      logger.warn({ err: e.message }, "Gemini LLM call failed");
    }
  }

  if (process.env.OPENAI_API_KEY || process.env.LLM_API_KEY) {
    try {
      const key = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }]
        })
      });
      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text.trim();
      }
    } catch (e: any) {
      logger.warn({ err: e.message }, "OpenAI LLM call failed");
    }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }]
        })
      });
      if (response.ok) {
        const data = await response.json();
        const text = data.content?.[0]?.text;
        if (text) return text.trim();
      }
    } catch (e: any) {
      logger.warn({ err: e.message }, "Anthropic LLM call failed");
    }
  }

  logger.warn("no LLM keys configured (or call failed), using fallback mock response");
  return fallbackText;
}

async function executeResearch(query: string, translateTo?: string): Promise<ResearchResult> {
  const localPayments: PaymentLogEntry[] = [];

  const localCallWorker = async (workerName: string, url: string, options?: RequestInit) => {
    const client = buildClient();
    logger.info({ workerName, url }, "paying worker");

    const fetchWithPay = wrapFetchWithPayment(fetch, client);
    const response = await fetchWithPay(url, options);
    if (!response.ok) {
      const paymentRequiredHeader = response.headers.get("payment-required");
      if (paymentRequiredHeader) {
        try {
          const decoded = JSON.parse(Buffer.from(paymentRequiredHeader, "base64").toString("utf-8"));
          logger.error({ decoded }, "payment required details");
        } catch (e) {}
      }
      throw new Error(`${workerName} call failed: HTTP ${response.status}`);
    }

    const responseHeader = response.headers.get("payment-response");
    let txId: string | undefined;
    if (responseHeader) {
      try {
        const decoded = JSON.parse(Buffer.from(responseHeader, "base64").toString("utf-8"));
        txId = decoded.transaction;
      } catch {
        txId = responseHeader;
      }
    }

    localPayments.push({ worker: workerName, url, txId });

    return response.json();
  };

  // 1. Discover and call Provenance Agent (Paid)
  const provenanceCandidates = await discoverAgent("provenance");
  const provenanceUrl = selectBestAgent(provenanceCandidates, `${process.env.PROVENANCE_AGENT_URL ?? "http://localhost:4021"}/provenance`);

  logger.info({ provenanceUrl }, "resolved Provenance Agent URL");
  const startTimeProv = Date.now();
  let searchResult;
  try {
    searchResult = await localCallWorker(
      "Provenance Agent",
      provenanceUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      }
    );
    updateReputation(provenanceUrl, Date.now() - startTimeProv, true);
  } catch (err) {
    updateReputation(provenanceUrl, Date.now() - startTimeProv, false);
    throw err;
  }

  logger.info("Provenance Agent responded with results");

  const resultsText = JSON.stringify(searchResult.results);

  // 2. LLM Step: Select claim to verify
  const claimPrompt = `Based on the following research results, identify a single, key factual claim that is most critical to verify. Return ONLY the identified claim itself, in bold:

  ${resultsText}`;
  const fallbackClaim = `The search results for "${query}" are accurate.`;
  const claimToVerify = await runLLM(claimPrompt, fallbackClaim);

  logger.info({ claimToVerify }, "selected claim to verify");

  // 3. Discover and call Verification Agent (Paid)
  const verificationCandidates = await discoverAgent("verification");
  const verificationUrl = selectBestAgent(verificationCandidates, `${process.env.VERIFICATION_AGENT_URL ?? "http://localhost:4023"}/verify`);

  logger.info({ verificationUrl }, "resolved Verification Agent URL");
  const startTimeVerify = Date.now();
  let verifyResult;
  try {
    verifyResult = await localCallWorker(
      "Verification Agent",
      verificationUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claim: claimToVerify,
          provenance: searchResult
        }),
      }
    );
    updateReputation(verificationUrl, Date.now() - startTimeVerify, true);
  } catch (err) {
    updateReputation(verificationUrl, Date.now() - startTimeVerify, false);
    throw err;
  }

  logger.info("Verification Agent responded");

  // 4. Discover and call Trust Synthesis Agent (Paid)
  const synthesisCandidates = await discoverAgent("synthesis");
  const synthesisUrl = selectBestAgent(synthesisCandidates, `${process.env.TRUST_SYNTHESIS_AGENT_URL ?? "http://localhost:4022"}/synthesize`);

  logger.info({ synthesisUrl }, "resolved Trust Synthesis Agent URL");
  const startTimeSynthesize = Date.now();
  let summarizeResult;
  try {
    summarizeResult = await localCallWorker(
      "Trust Synthesis Agent",
      synthesisUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: resultsText,
          verification: verifyResult,
          verificationMethod: searchResult.verificationMethod
        }),
      }
    );
    updateReputation(synthesisUrl, Date.now() - startTimeSynthesize, true);
  } catch (err) {
    updateReputation(synthesisUrl, Date.now() - startTimeSynthesize, false);
    throw err;
  }

  logger.info("Trust Synthesis Agent responded");

  // 5. Final LLM synthesis of the user report
  const reportPrompt = `Write a comprehensive, professional research report for the query: "${query}".
  Include the following sections:
  1. Executive Summary
  2. Findings Table (listing sources, details, and credibility method: cryptographic vs inferred)
  3. Verification Report (verifying "${claimToVerify}" - verdict: ${verifyResult.verdict}, confidence: ${verifyResult.confidence}%, reason: ${verifyResult.reasoning})
  4. Overall Trust Synthesis (summary: ${summarizeResult.summary}, trust score: ${summarizeResult.trustScore}/100)

  Use the findings: ${resultsText}`;
  const fallbackReport = `Research report for "${query}". Overall Trust Score: ${summarizeResult.trustScore}/100. Verification verdict: ${verifyResult.verdict}.`;

  const finalReport = await runLLM(reportPrompt, fallbackReport);

  // 6. Dynamic translation step (Paid)
  let reportText = finalReport;
  let translationStatus: "completed" | "skipped" | "failed" = "skipped";
  let translationError: string | undefined = undefined;

  if (translateTo) {
    translationStatus = "failed"; // default to failed if requested but not finished
    logger.info({ translateTo }, "translation requested");
    const translationCandidates = await discoverAgent("translation");
    if (translationCandidates.length > 0) {
      const translationUrl = selectBestAgent(translationCandidates, "");
      if (translationUrl) {
        logger.info({ translationUrl }, "resolved Translation Agent URL");
        const startTimeTranslate = Date.now();
        try {
          const translationResult = await localCallWorker(
            "Translation Agent",
            translationUrl,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: finalReport,
                targetLanguage: translateTo
              })
            }
          );
          updateReputation(translationUrl, Date.now() - startTimeTranslate, true);
          if (translationResult.translatedText) {
            reportText = translationResult.translatedText;
            translationStatus = "completed";
          } else {
            translationError = "Translation agent returned empty response";
          }
        } catch (err: any) {
          updateReputation(translationUrl, Date.now() - startTimeTranslate, false);
          translationError = err.message;
          logger.warn({ err: err.message }, "dynamic Translation Agent failed, returning untranslated report as fallback");
        }
      } else {
        translationError = "No translation agent URL resolved";
      }
    } else {
      translationError = "No translation agent registered in Bazaar registry";
      logger.info("no Translation Agent registered in Bazaar, skipping translation");
    }
  }

  return {
    report: reportText,
    payments: localPayments,
    trustScore: summarizeResult.trustScore,
    verificationMethod: summarizeResult.verificationMethod,
    verification: verifyResult,
    provenance: {
      type: searchResult.verificationMethod,
      creator: searchResult.results?.creator,
      signatureIssuer: searchResult.results?.signatureIssuer,
      aiDisclosure: searchResult.results?.isAIGenerated,
      source: searchResult.verificationMethod === "cryptographic" ? "C2PA Manifest Store" : (searchResult.results?.[0]?.url || "Web Search"),
      confidence: searchResult.verificationMethod === "cryptographic" ? 1.0 : 0.85
    },
    translationStatus,
    translationError
  };
}

const ResearchBodySchema = z.object({
  query: z.string().min(1, "query must be a non-empty string"),
  translateTo: z.string().min(1).optional(),
});

async function main() {
  const isServer = process.argv.includes("--server") || !process.argv[2];

  if (isServer) {
    const app = express();
    app.use(cors());
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

    app.post("/research", async (req, res) => {
      const parsed = ResearchBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        logger.warn({ issues: parsed.error.issues }, "rejected malformed /research body");
        sendProblem(res, 400, "Invalid Request Body", parsed.error.issues.map((i) => i.message).join("; "));
        return;
      }
      const { query, translateTo } = parsed.data;

      logger.info({ query, translateTo }, "/research request received");
      try {
        const result = await executeResearch(query, translateTo);
        res.json(result);
      } catch (err: any) {
        logger.error({ err: err.message }, "research failed");
        sendProblem(res, 500, "Internal Server Error", err.message);
      }
    });

    const PORT = Number(process.env.PORT) || 4020;
    app.listen(PORT, () => {
      logger.info(`server listening on port :${PORT}`);
    });
  } else {
    const query = process.argv[2];
    console.log(`\nTrustMesh (CLI Mode) — researching: "${query}"\n`);
    try {
      const result = await executeResearch(query);
      console.log("\n========================================================");
      console.log("                  FINAL RESEARCH REPORT                 ");
      console.log("========================================================");
      console.log(result.report);
      console.log("========================================================\n");

      console.log("[orchestrator] Payment audit trail:");
      console.table(result.payments);
    } catch (err: any) {
      logger.error({ err: err.message }, "orchestrator CLI run failed");
      process.exit(1);
    }
  }
}

main().catch((err) => {
  logger.error({ err: err.message }, "orchestrator failed");
  process.exit(1);
});
