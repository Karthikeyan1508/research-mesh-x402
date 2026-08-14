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
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactAvmScheme, toClientAvmSigner } from "@x402/avm";
import algosdk from "algosdk";

type PaymentLogEntry = {
  worker: string;
  url: string;
  txId?: string;
};

const paymentLog: PaymentLogEntry[] = [];

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

async function callWorker(workerName: string, url: string, options?: RequestInit) {
  const client = buildClient();
  console.log(`[orchestrator] paying ${workerName} -> ${url}`);

  const fetchWithPay = wrapFetchWithPayment(fetch, client);
  const response = await fetchWithPay(url, options);
  if (!response.ok) {
    const paymentRequiredHeader = response.headers.get("payment-required");
    if (paymentRequiredHeader) {
      try {
        const decoded = JSON.parse(Buffer.from(paymentRequiredHeader, "base64").toString("utf-8"));
        console.error(`[orchestrator] Payment Required details:`, JSON.stringify(decoded, null, 2));
      } catch (e) {}
    }
    throw new Error(`${workerName} call failed: HTTP ${response.status}`);
  }

  // The PAYMENT-RESPONSE header contains base64-encoded SettleResponse object.
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

  paymentLog.push({ worker: workerName, url, txId });

  return response.json();
}

async function runLLM(prompt: string, fallbackText: string): Promise<string> {
  const apiKey = process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;

  if (process.env.GEMINI_API_KEY || (process.env.LLM_API_KEY && !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY)) {
    try {
      const key = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
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
      console.warn("[orchestrator] Gemini LLM call failed:", e.message);
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
      console.warn("[orchestrator] OpenAI LLM call failed:", e.message);
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
      console.warn("[orchestrator] Anthropic LLM call failed:", e.message);
    }
  }

  console.warn("[orchestrator] No LLM keys configured (or call failed) — using fallback mock response.");
  return fallbackText;
}

async function main() {
  const query = process.argv[2] ?? "latest news on Algorand x402";

  console.log(`\nResearchMesh — researching: "${query}"\n`);

  // 1. Call Search Agent (Paid)
  const searchResult = await callWorker(
    "Search Agent",
    `${process.env.SEARCH_AGENT_URL ?? "http://localhost:4021"}/search?q=${encodeURIComponent(
      query
    )}`
  );

  console.log("\n[orchestrator] Search Agent responded with results.");

  const resultsText = JSON.stringify(searchResult.results);

  // 2. Identify claim to verify
  const claimPrompt = `Based on these search results for query "${query}", extract a single key factual claim or statement that should be fact-checked.\nSearch Results: ${resultsText}`;
  const mockClaim = `Algorand's x402 protocol enables pay-per-API-call micropayments.`;
  const claimToVerify = await runLLM(claimPrompt, mockClaim);
  console.log(`\n[orchestrator] Extracted claim to verify: "${claimToVerify}"`);

  // 3. Call Fact-Checker Agent (Paid)
  const verifyResult = await callWorker(
    "Fact-Checker Agent",
    `${process.env.FACT_CHECKER_AGENT_URL ?? "http://localhost:4023"}/verify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim: claimToVerify }),
    }
  );
  console.log(`[orchestrator] Fact-Checker Agent responded:`, verifyResult);

  // 4. Call Summarizer Agent (Paid)
  const summarizeResult = await callWorker(
    "Summarizer Agent",
    `${process.env.SUMMARIZER_AGENT_URL ?? "http://localhost:4022"}/summarize`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: resultsText }),
    }
  );
  console.log(`[orchestrator] Summarizer Agent responded:`, summarizeResult);

  // 5. Synthesize final report using LLM
  console.log("\n[orchestrator] Synthesizing final report...");
  const reportPrompt = `Create a final synthesized research report for query "${query}" based on the following resources:
- Summary of Search: ${summarizeResult.summary}
- Fact-Check Verdict for "${claimToVerify}": ${verifyResult.verdict} (Confidence: ${verifyResult.confidence}%, Reasoning: ${verifyResult.reasoning})

Format the report beautifully with markdown, including clear headings and citations.`;

  const fallbackReport = `# Research Report: ${query}

## Summary of Findings
${summarizeResult.summary}

## Fact Verification
- **Claim**: ${claimToVerify}
- **Verdict**: **${verifyResult.verdict}** (${verifyResult.confidence}% confidence)
- **Details**: ${verifyResult.reasoning}

*Report compiled by ResearchMesh using on-chain gated services.*`;

  const finalReport = await runLLM(reportPrompt, fallbackReport);

  console.log("\n========================================================");
  console.log("                  FINAL RESEARCH REPORT                 ");
  console.log("========================================================");
  console.log(finalReport);
  console.log("========================================================\n");

  console.log("[orchestrator] Payment audit trail:");
  console.table(paymentLog);
}

main().catch((err) => {
  console.error("[orchestrator] failed:", err.message);
  process.exit(1);
});
