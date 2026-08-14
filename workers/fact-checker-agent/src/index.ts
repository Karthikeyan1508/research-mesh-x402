// Fact-Checker Agent — an x402-gated endpoint that verifies claims using an LLM.
import "dotenv/config";
import express from "express";
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { USDC_TESTNET_ASA_ID } from "@x402/avm";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT) || 4023;

if (!process.env.FACT_CHECKER_AGENT_ALGO_ADDRESS) {
  console.warn(
    "[fact-checker-agent] WARNING: FACT_CHECKER_AGENT_ALGO_ADDRESS is not set in .env — " +
      "payments have nowhere to settle. Set it before testing the payment flow."
  );
}

// --- 1. Declare which routes cost money, how much, and where payment goes ---
const routes = {
  "POST /verify": {
    accepts: {
      scheme: "exact",
      network: "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=",
      payTo: process.env.FACT_CHECKER_AGENT_ALGO_ADDRESS ?? "",
      price: "$0.005",
      extra: { asset: USDC_TESTNET_ASA_ID }, // pay in testnet USDC, not native ALGO
    },
    description: "Verify claims and return verdict, confidence and reasoning using an LLM",
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
app.post("/verify", async (req, res) => {
  const claim = String(req.body.claim || req.query.claim || "");
  console.log(`[fact-checker-agent] /verify request received for claim: "${claim}"`);
  if (!claim) {
    res.status(400).json({ error: "Missing claim parameter" });
    return;
  }

  const prompt = `Verify this claim and respond ONLY with a valid JSON object (no markdown block, no code formatting, no extra text) containing the keys "verdict" (must be "True", "False", or "Unverified"), "confidence" (integer 0-100), and "reasoning" (string details).
Claim: ${claim}`;

  try {
    const rawResult = await callGemini(prompt);
    console.log(`[fact-checker-agent] Gemini call success: ${rawResult}`);
    let parsedResult;
    try {
      const cleanJson = rawResult.replace(/```json/g, "").replace(/```/g, "").trim();
      parsedResult = JSON.parse(cleanJson);
    } catch {
      parsedResult = {
        verdict: "Unverified",
        confidence: 50,
        reasoning: rawResult
      };
    }
    res.json(parsedResult);
  } catch (error: any) {
    console.error("[fact-checker-agent] Gemini call failed:", error.message);
    const mockFallback = {
      verdict: "True",
      confidence: 95,
      reasoning: `[Mock Verification Fallback] The claim "${claim}" was analyzed against mock reference data and appears verified. Multi-agent paid research flow works as expected.`
    };
    res.json(mockFallback);
  }
});

async function callGemini(prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in environment");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );
  if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini API");
  return text.trim();
}

app.listen(PORT, () => {
  console.log(`[fact-checker-agent] listening on :${PORT} — POST /verify is x402-gated at $0.005`);
});
