import "dotenv/config";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT) || 4024;
const USDC_TESTNET_ASA_ID = "31566704"; // USDC Testnet ASA ID

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
      console.warn(`[translation-agent] Gemini call attempt ${attempt} failed: ${response.statusText}`);
    } catch (e: any) {
      console.warn(`[translation-agent] Gemini call attempt ${attempt} failed:`, e.message);
    }
  }
  throw new Error("Failed to call Gemini API after retries");
}

app.post("/translate", async (req, res) => {
  const { text, targetLanguage } = req.body;
  if (!text || !targetLanguage) {
    res.status(400).json({ error: "Missing text or targetLanguage in request body" });
    return;
  }

  console.log(`[translation-agent] /translate request received for language: "${targetLanguage}"`);

  try {
    const prompt = `Translate the following text into ${targetLanguage}. Return ONLY the translated text without any conversational preamble or notes:\n\n${text}`;
    const translatedText = await callGemini(prompt);
    console.log(`[translation-agent] Translation success.`);
    res.json({ translatedText });
  } catch (err: any) {
    console.error(`[translation-agent] Translation failed:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

async function registerService() {
  const routeKey = "POST /translate";
  const accepts = routes[routeKey].accepts;
  try {
    const response = await fetch("http://localhost:4025/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resourceUrl: `http://localhost:${PORT}/translate`,
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
      console.log(`[translation-agent] Successfully registered to Local Bazaar Registry`);
    } else {
      console.warn(`[translation-agent] Registration failed: ${response.statusText}`);
    }
  } catch (err: any) {
    console.warn(`[translation-agent] Registry registration failed: ${err.message}`);
  }
}

app.listen(PORT, () => {
  console.log(`[translation-agent] listening on :${PORT} — POST /translate is x402-gated at $0.005`);
  registerService();
});
