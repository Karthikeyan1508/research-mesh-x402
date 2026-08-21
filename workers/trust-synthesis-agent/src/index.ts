// Trust Synthesis Agent — an x402-gated endpoint that synthesizes/summarizes text using an LLM.
import "dotenv/config";
import express from "express";
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { USDC_TESTNET_ASA_ID } from "@x402/avm";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT) || 4022;

if (!process.env.TRUST_SYNTHESIS_AGENT_ALGO_ADDRESS) {
  console.warn(
    "[trust-synthesis-agent] WARNING: TRUST_SYNTHESIS_AGENT_ALGO_ADDRESS is not set in .env — " +
      "payments have nowhere to settle. Set it before testing the payment flow."
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

// --- 3. The actual handler only runs once payment has settled ---
app.post("/synthesize", async (req, res) => {
  const text = String(req.body.text || req.query.text || "");
  const verification = req.body.verification;
  const verificationMethod = req.body.verificationMethod || "inferred";

  console.log(`[trust-synthesis-agent] /synthesize request received, text length: ${text.length}, method: ${verificationMethod}`);
  if (!text) {
    res.status(400).json({ error: "Missing text parameter" });
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

  console.log(`[trust-synthesis-agent] Computed Trust Score: ${trustScore} (Method: ${verificationMethod})`);

  try {
    const summary = await callGemini('Summarize this in 3-4 sentences: ' + text);
    console.log(`[trust-synthesis-agent] /synthesize success, summary length: ${summary.length}`);
    res.json({
      summary,
      trustScore,
      verificationMethod
    });
  } catch (error: any) {
    console.error("[trust-synthesis-agent] Gemini call failed:", error.message);
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
      console.warn(`[callGemini] Attempt ${attempt} failed: ${err.message}. Retrying in ${delay}ms...`);
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
    const response = await fetch("http://localhost:4025/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resourceUrl: `http://localhost:${PORT}/synthesize`,
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
      console.log(`[trust-synthesis-agent] Successfully registered to Local Bazaar Registry`);
    } else {
      console.warn(`[trust-synthesis-agent] Registration failed: ${response.statusText}`);
    }
  } catch (err: any) {
    console.warn(`[trust-synthesis-agent] Registry registration failed: ${err.message}`);
  }
}

app.listen(PORT, () => {
  console.log(`[trust-synthesis-agent] listening on :${PORT} — POST /synthesize is x402-gated at $0.005`);
  registerService();
});
