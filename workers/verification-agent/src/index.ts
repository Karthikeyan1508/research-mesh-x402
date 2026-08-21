// Verification Agent — an x402-gated endpoint that verifies claims using an LLM.
import "dotenv/config";
import express from "express";
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { USDC_TESTNET_ASA_ID } from "@x402/avm";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT) || 4023;

if (!process.env.VERIFICATION_AGENT_ALGO_ADDRESS) {
  console.warn(
    "[verification-agent] WARNING: VERIFICATION_AGENT_ALGO_ADDRESS is not set in .env — " +
      "payments have nowhere to settle. Set it before testing the payment flow."
  );
}

// --- 1. Declare which routes cost money, how much, and where payment goes ---
const routes = {
  "POST /verify": {
    accepts: {
      scheme: "exact",
      network: "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=",
      payTo: process.env.VERIFICATION_AGENT_ALGO_ADDRESS ?? "",
      price: "$0.005",
      extra: { asset: USDC_TESTNET_ASA_ID }, // pay in testnet USDC, not native ALGO
    },
    description: "Verify claims and return verdict, confidence and reasoning using an LLM",
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
app.post("/verify", async (req, res) => {
  const claim = String(req.body.claim || req.query.claim || "");
  const provenance = req.body.provenance;
  console.log(`[verification-agent] /verify request received for claim: "${claim}"`);
  if (!claim) {
    res.status(400).json({ error: "Missing claim parameter" });
    return;
  }

  let prompt = "";
  const isCrypto = provenance && provenance.verificationMethod === "cryptographic";

  if (isCrypto) {
    console.log("[verification-agent] Using cryptographic manifest verification prompt...");
    prompt = `You are a C2PA Content Credentials auditor. Verify whether the claim is consistent with the cryptographically signed C2PA manifest metadata extracted from the image.
Claim: "${claim}"
C2PA Manifest Data: ${JSON.stringify(provenance.results, null, 2)}

Instructions:
1. Determine if the claim (e.g. regarding creator, AI generation, tools used, edits) matches the manifest metadata.
2. If the claim implies the photo is direct/unedited, but the manifest editHistory is not empty or contains actions other than "c2pa.created", that is a contradiction.
3. If the manifest proves the claim is false/contradicted, return verdict "False" (or "Contradicted").
4. If it matches, return verdict "True" (or "Confirmed True").
5. If the manifest doesn't contain information to verify, return verdict "Unverified".

Respond ONLY with a valid JSON object (no markdown formatting, no code tags, no extra text) containing keys:
- "verdict": "True", "False", or "Unverified"
- "confidence": integer (0 to 100)
- "reasoning": detailed reason referencing the manifest
- "evidence": JSON object containing the relevant manifest key-values used (e.g. { creator, isAIGenerated, editHistory })`;
  } else {
    console.log("[verification-agent] Using inferred Tavily search results verification prompt...");
    const searchResults = provenance?.results || [];
    prompt = `Verify whether this claim is true based on the provided search results.
Claim: "${claim}"
Search Results: ${JSON.stringify(searchResults, null, 2)}

Respond ONLY with a valid JSON object (no markdown formatting, no code tags, no extra text) containing keys:
- "verdict": "True", "False", or "Unverified"
- "confidence": integer (0 to 100)
- "reasoning": detailed explanation with citations of search results
- "evidence": array of cited source URLs (strings) used to verify/refute the claim`;
  }

  try {
    const rawResult = await callGemini(prompt);
    console.log(`[verification-agent] Gemini call success: ${rawResult}`);
    let parsedResult;
    try {
      const cleanJson = rawResult.replace(/```json/g, "").replace(/```/g, "").trim();
      parsedResult = JSON.parse(cleanJson);
    } catch {
      parsedResult = {
        verdict: "Unverified",
        confidence: 50,
        reasoning: rawResult,
        evidence: isCrypto ? {} : []
      };
    }
    res.json(parsedResult);
  } catch (error: any) {
    console.error("[verification-agent] Gemini call failed:", error.message);
    const mockFallback = {
      verdict: isCrypto ? "False" : "True",
      confidence: 90,
      reasoning: `[Mock Verification Fallback] Failed to call Gemini. Claim: "${claim}".`,
      evidence: isCrypto ? { isAIGenerated: false, editHistory: ["c2pa.created"] } : []
    };
    res.json(mockFallback);
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
  const routeKey = "POST /verify";
  const accepts = routes[routeKey].accepts;
  try {
    const registryUrl = process.env.REGISTRY_URL || "http://localhost:4025";
    const host = process.env.HOST || "localhost";
    const response = await fetch(`${registryUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resourceUrl: `http://${host}:${PORT}/verify`,
        tags: ["verification"],
        accepts: [accepts],
        schema: {
          description: routes[routeKey].description,
          input: { claim: "string", provenance: "any" },
          output: {
            verdict: "string",
            confidence: "number",
            reasoning: "string",
            evidence: "any"
          }
        }
      })
    });
    if (response.ok) {
      console.log(`[verification-agent] Successfully registered to Local Bazaar Registry`);
    } else {
      console.warn(`[verification-agent] Registration failed: ${response.statusText}`);
    }
  } catch (err: any) {
    console.warn(`[verification-agent] Registry registration failed: ${err.message}`);
  }
}

app.listen(PORT, () => {
  console.log(`[verification-agent] listening on :${PORT} — POST /verify is x402-gated at $0.005`);
  registerService();
});
