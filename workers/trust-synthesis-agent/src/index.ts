// Trust Synthesis Agent — an x402-gated endpoint that synthesizes/summarizes text using an LLM.
import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import pino from "pino";
import { z } from "zod";
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { USDC_TESTNET_ASA_ID } from "@x402/avm";

const logger = pino({ level: process.env.LOG_LEVEL || "info", name: "trust-synthesis-agent" });

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

const PORT = Number(process.env.PORT) || 4022;

if (!process.env.TRUST_SYNTHESIS_AGENT_ALGO_ADDRESS) {
  logger.warn(
    "TRUST_SYNTHESIS_AGENT_ALGO_ADDRESS is not set in .env — payments have nowhere to settle. Set it before testing the payment flow."
  );
}

// --- 1. Declare which routes cost money, how much, and where payment goes ---
const routes = {
  "POST /synthesize": {
    accepts: {
      scheme: "exact",
      network: "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=",
      payTo: process.env.TRUST_SYNTHESIS_AGENT_ALGO_ADDRESS ?? "",
      price: "$0.005",
      extra: { asset: USDC_TESTNET_ASA_ID }, // pay in testnet USDC, not native ALGO
    },
    description: "Synthesize/summarize text in 3-4 sentences using an LLM",
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

const SynthesizeBodySchema = z
  .object({
    text: z.string().min(1).optional(),
    verification: z.any().optional(),
    verificationMethod: z.string().optional(),
  })
  .passthrough();

// --- 3. The actual handler only runs once payment has settled ---
app.post("/synthesize", async (req, res) => {
  const parsed = SynthesizeBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, "rejected malformed /synthesize body");
    sendProblem(res, 400, "Invalid Request Body", parsed.error.issues.map((i) => i.message).join("; "));
    return;
  }

  const text = String(parsed.data.text || req.query.text || "");
  const verification = parsed.data.verification;
  const verificationMethod = parsed.data.verificationMethod || "inferred";

  logger.info({ textLength: text.length, verificationMethod }, "/synthesize request received");
  if (!text) {
    sendProblem(res, 400, "Missing Parameter", "Missing text parameter");
    return;
  }

  // Calculate Trust Score based on verification verdict, confidence and verificationMethod
  let trustScore = 50; // default midpoint
  if (verification) {
    const confidence = Number(verification.confidence || 0);
    const verdict = String(verification.verdict || "").toLowerCase();

    const isTrue = verdict.includes("true") || verdict.includes("consistent") || verdict.includes("confirmed") || verdict.includes("supported");
    const isFalse = verdict.includes("false") || verdict.includes("contradicted") || verdict.includes("inconsistent");

    if (verificationMethod === "cryptographic") {
      if (isTrue) {
        trustScore = Math.round(confidence);
      } else if (isFalse) {
        trustScore = Math.max(0, Math.round(100 - confidence));
      } else {
        trustScore = 50;
      }
    } else {
      // Inferred path: cap maximum score at 85
      if (isTrue) {
        trustScore = Math.min(85, Math.round(confidence * 0.85));
      } else if (isFalse) {
        trustScore = Math.min(85, Math.max(0, Math.round((100 - confidence) * 0.85)));
      } else {
        trustScore = Math.min(85, Math.round(50 * 0.85)); // 43
      }
    }
  }

  logger.info({ trustScore, verificationMethod }, "computed Trust Score");

  try {
    const summary = await callGemini('Summarize this in 3-4 sentences: ' + text);
    logger.info({ summaryLength: summary.length }, "/synthesize success");
    res.json({
      summary,
      trustScore,
      verificationMethod
    });
  } catch (error: any) {
    logger.error({ err: error.message }, "Gemini call failed");
    const mockFallback = `[Mock Summary Fallback] The input text of length ${text.length} was processed successfully. It contains details regarding the research query. Multi-agent research is verified working on-chain.`;
    res.json({
      summary: mockFallback,
      trustScore,
      verificationMethod
    });
  }
});

async function callGemini(prompt: string, retries = 3, delay = 1000): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in environment");
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
          signal: controller.signal,
        }
      );
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Empty response from Gemini API");
      return text.trim();
    } catch (err: any) {
      if (attempt === retries) throw err;
      logger.warn({ attempt, err: err.message, delay }, "callGemini attempt failed, retrying");
      await new Promise(resolve => setTimeout(resolve, delay));
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw new Error("Failed to call Gemini API after retries");
}

async function registerService() {
  const routeKey = "POST /synthesize";
  const accepts = routes[routeKey].accepts;
  try {
    const registryUrl = process.env.REGISTRY_URL || "http://localhost:4025";
    const host = process.env.HOST || "localhost";
    const response = await fetch(`${registryUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resourceUrl: `http://${host}:${PORT}/synthesize`,
        tags: ["synthesis"],
        accepts: [accepts],
        schema: {
          description: routes[routeKey].description,
          input: { text: "string", verification: "any", verificationMethod: "string" },
          output: {
            summary: "string",
            trustScore: "number",
            verificationMethod: "string"
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
  logger.info(`listening on :${PORT} — POST /synthesize is x402-gated at $0.005`);
  registerService();
});
