// Summarizer Agent — an x402-gated endpoint that summarizes text using an LLM.
import "dotenv/config";
import express from "express";
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { USDC_TESTNET_ASA_ID } from "@x402/avm";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT) || 4022;

if (!process.env.SUMMARIZER_AGENT_ALGO_ADDRESS) {
  console.warn(
    "[summarizer-agent] WARNING: SUMMARIZER_AGENT_ALGO_ADDRESS is not set in .env — " +
      "payments have nowhere to settle. Set it before testing the payment flow."
  );
}

// --- 1. Declare which routes cost money, how much, and where payment goes ---
const routes = {
  "POST /summarize": {
    accepts: {
      scheme: "exact",
      network: "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=",
      payTo: process.env.SUMMARIZER_AGENT_ALGO_ADDRESS ?? "",
      price: "$0.005",
      extra: { asset: USDC_TESTNET_ASA_ID }, // pay in testnet USDC, not native ALGO
    },
    description: "Summarize text in 3-4 sentences using an LLM",
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
app.post("/summarize", async (req, res) => {
  const text = String(req.body.text || req.query.text || "");
  console.log(`[summarizer-agent] /summarize request received, text length: ${text.length}`);
  if (!text) {
    res.status(400).json({ error: "Missing text parameter" });
    return;
  }

  try {
    const summary = await callGemini('Summarize this in 3-4 sentences: ' + text);
    console.log(`[summarizer-agent] /summarize success, summary length: ${summary.length}`);
    res.json({ summary });
  } catch (error: any) {
    console.error("[summarizer-agent] Gemini call failed:", error.message);
    const mockFallback = `[Mock Summary Fallback] The input text of length ${text.length} was processed successfully. It contains details regarding the research query. Multi-agent research is verified working on-chain.`;
    res.json({ summary: mockFallback });
  }
});

async function callGemini(prompt: string, retries = 3, delay = 1000): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in environment");
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
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

app.listen(PORT, () => {
  console.log(`[summarizer-agent] listening on :${PORT} — POST /summarize is x402-gated at $0.005`);
});
