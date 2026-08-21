import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import pino from "pino";
import { z } from "zod";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { USDC_TESTNET_ASA_ID, ALGORAND_TESTNET_CAIP2 } from "@x402/avm";

const logger = pino({ level: process.env.LOG_LEVEL || "info", name: "translation-agent" });

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

const PORT = Number(process.env.PORT) || 4024;

const facilitatorClient = new HTTPFacilitatorClient({
  url: process.env.FACILITATOR_URL || "https://facilitator.goplausible.xyz"
});

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("algorand:*", new ExactAvmScheme());

// Declare the Bazaar discovery extension schemas for Translation
const discoveryExt = declareDiscoveryExtension({
  method: "POST",
  input: {
    text: "string",
    targetLanguage: "string"
  },
  inputSchema: {
    properties: {
      text: { type: "string" },
      targetLanguage: { type: "string" }
    },
    required: ["text", "targetLanguage"]
  },
  bodyType: "json",
  output: {
    example: {
      translatedText: "string"
    }
  }
});

const routes = {
  "POST /translate": {
    accepts: {
      scheme: "exact",
      network: "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=", // Testnet Algorand Genesis Hash
      payTo: process.env.TRANSLATION_AGENT_ALGO_ADDRESS ?? "",
      price: "$0.005",
      extra: { asset: USDC_TESTNET_ASA_ID }
    },
    description: "Translate research reports into any language using Gemini",
    tags: ["translation"],
    extensions: discoveryExt
  }
};

app.use(paymentMiddleware(routes, resourceServer));

const TranslateBodySchema = z.object({
  text: z.string().min(1, "text must be a non-empty string"),
  targetLanguage: z.string().min(1, "targetLanguage must be a non-empty string"),
});

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  // Use Gemini 3.1 Flash-Lite as preferred by user
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text.trim();
      }
      logger.warn({ attempt, statusText: response.statusText }, "Gemini call attempt failed");
    } catch (e: any) {
      logger.warn({ attempt, err: e.message }, "Gemini call attempt failed");
    }
  }
  throw new Error("Failed to call Gemini API after retries");
}

app.post("/translate", async (req, res) => {
  const parsed = TranslateBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, "rejected malformed /translate body");
    sendProblem(res, 400, "Invalid Request Body", parsed.error.issues.map((i) => i.message).join("; "));
    return;
  }
  const { text, targetLanguage } = parsed.data;

  logger.info({ targetLanguage }, "/translate request received");

  try {
    const prompt = `Translate the following text into ${targetLanguage}. Return ONLY the translated text without any conversational preamble or notes:\n\n${text}`;
    const translatedText = await callGemini(prompt);
    logger.info("translation success");
    res.json({ translatedText });
  } catch (err: any) {
    logger.error({ err: err.message }, "translation failed");
    sendProblem(res, 500, "Internal Server Error", err.message);
  }
});

async function registerService() {
  const routeKey = "POST /translate";
  const accepts = routes[routeKey].accepts;
  try {
    const registryUrl = process.env.REGISTRY_URL || "http://localhost:4025";
    const host = process.env.HOST || "localhost";
    const response = await fetch(`${registryUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resourceUrl: `http://${host}:${PORT}/translate`,
        tags: ["translation"],
        accepts: [accepts],
        schema: {
          description: routes[routeKey].description,
          input: { text: "string", targetLanguage: "string" },
          output: {
            translatedText: "string"
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
  logger.info(`listening on :${PORT} — POST /translate is x402-gated at $0.005`);
  registerService();
});
