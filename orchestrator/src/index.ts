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

async function callWorker(workerName: string, url: string) {
  const client = buildClient();
  console.log(`[orchestrator] paying ${workerName} -> ${url}`);

  const fetchWithPay = wrapFetchWithPayment(fetch, client);
  const response = await fetchWithPay(url);
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

async function main() {
  const query = process.argv[2] ?? "latest news on Algorand x402";

  console.log(`\nResearchMesh — researching: "${query}"\n`);

  const searchResult = await callWorker(
    "Search Agent",
    `${process.env.SEARCH_AGENT_URL ?? "http://localhost:4021"}/search?q=${encodeURIComponent(
      query
    )}`
  );

  console.log("\n[orchestrator] Search Agent responded:");
  console.log(JSON.stringify(searchResult, null, 2));

  // TODO (Phase 5): pipe searchResult into the Summarizer Agent, then the
  // Fact-Checker Agent, then ask an LLM to synthesize a final cited report.

  console.log("\n[orchestrator] Payment audit trail so far:");
  console.table(paymentLog);
}

main().catch((err) => {
  console.error("[orchestrator] failed:", err.message);
  process.exit(1);
});
