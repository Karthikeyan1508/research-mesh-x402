# ResearchMesh

**An agent-to-agent research marketplace, paid per call, settled on Algorand via x402.**

Built for the [x402 Global Challenge PreHack: BLR Edition](https://algorand.co/global-x402-challenge) (23 Aug 2026), hosted by AlgoBharat, KrowdKraft, HackCulture, and Algorand.

---

## The Problem

Getting a well-researched, trustworthy answer today means either relying on a single LLM that can hallucinate, or a human manually stitching together separate search, summarization, and fact-checking tools. There's no standard way for one AI agent to autonomously discover a specialist agent, pay it for a single use, and prove afterward exactly what was paid to whom for which piece of the work. Existing solutions rely on subscriptions or API keys, which don't fit a world where agents transact with each other in real time, on demand, without a human approving each call.

## The Solution

ResearchMesh is an orchestrator agent paired with three specialist worker agents — **Search**, **Fact-Checker**, and **Summarizer** — each running as its own micro-service, each gated by the x402 payment protocol. When a user asks a research question, the orchestrator calls each worker in sequence, paying per call in real USDC the moment it uses that worker's endpoint. Payment settles instantly on Algorand testnet, and the orchestrator assembles the verified results into a final cited report, alongside a transparent, on-chain audit trail of every micropayment made.

Every request produces:
- A synthesized research report (Gemini-generated)
- A fact-checked claim with a confidence score
- A payment audit trail linking to real settled transactions on Algorand

## Live Demo

Open `index.html` in a browser (with the orchestrator and all three agent servers running locally), type a research question, and click **Research**. Within seconds you'll see:

1. The orchestrator paying the Search Agent ($0.01 USDC) for live web results
2. The orchestrator paying the Fact-Checker Agent ($0.005 USDC) to verify a claim
3. The orchestrator paying the Summarizer Agent ($0.005 USDC) to condense the findings
4. A final report, plus a "Payment Audit Trail" panel with clickable links to each settled transaction on [Lora](https://lora.algokit.io/testnet), Algorand's testnet explorer

## Architecture

### High level

```
User → Orchestrator (Express server, port 4020)
          │
          ├─ Search Agent (port 4021)      — x402-gated, real Tavily search
          ├─ Fact-Checker Agent (4023)     — x402-gated, Gemini-verified claims
          └─ Summarizer Agent (4022)       — x402-gated, Gemini-condensed summary
          │
          └─ Aggregates results → synthesizes final report → returns JSON
                (report + payment audit trail) → rendered by index.html
```

### How a single paid call works

1. Orchestrator calls a worker's endpoint (e.g. `GET /search`).
2. Worker responds `402 Payment Required` with a structured payment challenge (price, Algorand address, asset ID) in the response headers.
3. Orchestrator's x402 client (`@x402/fetch` + `@x402/avm`) signs a payment from its own Algorand wallet and retries the request with an `X-PAYMENT` header.
4. The GoPlausible x402 facilitator verifies the signature and settles the USDC payment on Algorand testnet (~3 second finality).
5. Once settlement is confirmed, the worker returns `200 OK` with the real result (search data, summary, or verification verdict).
6. The orchestrator logs `{worker, amount, txId}` for every call, building the audit trail shown in the final UI.

## Tech Stack

- **Backend:** Node.js + TypeScript, Express
- **x402:** `@x402/core`, `@x402/avm`, `@x402/express`, `@x402/fetch`
- **Blockchain:** Algorand testnet, `algosdk`, USDC (ASA 10458941) as the payment asset
- **Facilitator:** GoPlausible's hosted x402 facilitator
- **Search:** Tavily API
- **LLM:** Google Gemini API — model: `gemini-3.1-flash-lite` (summarization + fact-checking + report synthesis)
- **Frontend:** Single-page HTML/CSS/JS dashboard with live payment status and markdown report rendering

## x402 Endpoints

| Agent | Route | Price | What it does |
|---|---|---|---|
| Search Agent | `GET /search` | $0.01 USDC | Live web search via Tavily |
| Fact-Checker Agent | `POST /verify` | $0.005 USDC | Verifies a claim via Gemini, returns verdict + confidence |
| Summarizer Agent | `POST /summarize` | $0.005 USDC | Condenses findings via Gemini |

All three settle on Algorand testnet through the GoPlausible facilitator, with a `feePayer` covering network fees on behalf of the paying client (fee abstraction).

## Running It Locally

```bash
# 1. Install dependencies in each service
cd workers/search-agent && npm install
cd ../summarizer-agent && npm install
cd ../fact-checker-agent && npm install
cd ../../orchestrator && npm install

# 2. Set up .env in each folder (see .env.example) with your own
#    Algorand testnet wallet, Tavily key, and Gemini key

# 3. Start each agent (separate terminals)
cd workers/search-agent && npm run dev        # :4021
cd workers/summarizer-agent && npm run dev    # :4022
cd workers/fact-checker-agent && npm run dev  # :4023
cd orchestrator && npm run dev                # :4020 (server mode)

# 4. Serve the frontend
npx -y serve . --listen 3000
# If port 3000 is already in use, serve automatically picks the next free port
# and prints it, e.g.:
#   Serving!
#   - Local:    http://localhost:52392
#   - Network:  http://192.168.56.1:52392
#   This port was picked because 3000 is in use.
# Open whichever "Local" URL is printed in your browser.
```

## Roadmap / Stretch Goals

- **Bazaar discovery** — register each worker's capability/price in the x402 Bazaar registry so the orchestrator finds agents dynamically instead of via hardcoded URLs.
- **More worker agents** — additional specialists (translation, sentiment, citation-formatting) plugged into the same pattern.
- **Mainnet deployment** — carrying this forward into the Algorand Global x402 Challenge.

---

*Built as part of the x402 Global Challenge PreHack: BLR Edition, 23 August 2026.*