# ResearchMesh

An agent-to-agent research marketplace on Algorand. An orchestrator agent pays specialist
worker agents (Search, Summarizer, Fact-Checker) per call, in USDC, over x402 — and returns
a final report with an on-chain payment audit trail.

Built for the **x402 Global Challenge PreHack: BLR Edition** (23 Aug 2026).

> **A note on the SDK**: x402 on Algorand is a brand-new, fast-moving stack. The package
> names and code below are based on GoPlausible's official docs as of Aug 2026
> (`@x402-avm/*`). Before you `npm install`, skim
> https://x402.goplausible.xyz/ and the linked GitHub examples to confirm the exact
> package names/versions haven't shifted since this was written.

---

## Build order (do these in sequence, not all at once)

1. **Environment setup** — install tools, create wallets, get testnet funds.
2. **Search Agent only** — one x402-gated endpoint. Get 402 → pay → 200 working end to end.
   This alone satisfies "at least one x402 endpoint" for the idea-submission requirement.
3. **Orchestrator** — a script that calls the Search Agent, pays it, and prints the result.
4. **Summarizer + Fact-Checker Agents** — copy the Search Agent pattern.
5. **Orchestrator logic** — LLM plans subtasks, calls all three workers in sequence, composes
   a final cited report, logs every payment + tx id.
6. **Frontend** — a simple UI that streams "paying X... settled (tx ...)" and shows the report.
7. **Bazaar discovery (stretch)** — register workers so the orchestrator finds them dynamically
   instead of hardcoded URLs.
8. **Polish + submit** — README, demo video/script, push to a public GitHub repo (must be
   open-source).

Do NOT try to build all three workers plus discovery plus frontend before testing a single
payment end to end. Get one payment flowing first — everything else is a repeat of the same
pattern.

---

## Phase 1 — Environment setup

```bash
# Node 18+ and a package manager
node -v

# AlgoKit CLI (Algorand's dev toolkit) — installs via pipx
pipx install algokit
algokit --version
# If pipx isn't installed: https://github.com/algorandfoundation/algokit-cli#install

# Confirm you can reach the facilitator
curl https://facilitator.goplausible.xyz/health
```

### Wallets

You need one Algorand testnet account per agent (orchestrator + 3 workers = 4 total).
Easiest path: generate them with `algosdk` and fund via AlgoKit's testnet dispenser.

```bash
cd research-mesh
npm install algosdk dotenv --workspace=scripts 2>/dev/null || npm install algosdk dotenv
node scripts/generate-wallets.js   # see scripts/ below — prints 4 addresses + mnemonics
```

Fund each address at the testnet dispenser (via AlgoKit CLI or
https://bank.testnet.algorand.network) with test ALGO, and get test USDC (ASA id referenced
in `@x402-avm/avm` as `USDC_TESTNET_ASA_ID`) — the facilitator docs link to a testnet USDC
faucet/opt-in flow.

Copy `.env.example` to `.env` in each service folder and fill in the addresses/keys.

---

## Phase 2 — Search Agent (the core MVP)

```bash
cd workers/search-agent
npm install
cp .env.example .env   # fill in SEARCH_AGENT_ALGO_ADDRESS + FACILITATOR_URL
npm run dev
```

This starts an Express server on `:4021` with one route, `GET /search`, gated by x402.
Hitting it without payment returns `402`. See `src/index.ts` — the `mockSearch()` function is
a stub; swap it for a real Tavily/SerpAPI call once the payment flow works.

Test it's gated correctly:

```bash
curl -i http://localhost:4021/search?q=algorand   # expect 402, not 200
```

Don't move to the orchestrator until you see that 402.

---

## Phase 3 — Orchestrator (pays the Search Agent)

```bash
cd orchestrator
npm install
cp .env.example .env   # fill in ORCHESTRATOR_PRIVATE_KEY
npm run dev -- "latest news on Algorand x402"
```

`src/index.ts` builds a signer from the orchestrator's wallet, wraps `fetch` with the x402
client, and calls the Search Agent. On success you should see the 402 → pay → 200 round trip
happen automatically and the search results print to the console. This is your first real
payment — check the transaction on Lora (Algorand's testnet explorer) to confirm it settled.

---

## Phase 4 — Summarizer + Fact-Checker Agents

Copy `workers/search-agent` into `workers/summarizer-agent` and `workers/fact-checker-agent`
(stub folders are already there). Change:
- the route path (`/summarize`, `/verify`)
- the price (these can be cheaper than search, e.g. `$0.005`)
- the handler logic (call an LLM instead of a search API)

Same pattern, three times. This is mechanical once Phase 2 works.

---

## Phase 5 — Orchestrator logic

Extend `orchestrator/src/index.ts` so it:
1. Takes a user question.
2. Asks an LLM to plan subtasks (does this need a search? a fact-check?).
3. Calls Search → Fact-Checker → Summarizer (or whatever order fits) via the paid endpoints.
4. Logs `{worker, amountPaid, txId}` for every call.
5. Asks the LLM to synthesize a final answer citing what came back.
6. Prints/returns the report + the payment audit trail.

---

## Phase 6 — Frontend (optional but strong for the demo)

A minimal Next.js or plain HTML page that:
- Takes the user's question.
- Streams status lines as each payment happens ("Paying Search Agent 0.01 USDC... settled ✅").
- Shows the final report.
- Shows a table of all payments with links to `https://lora.algokit.io/testnet/tx/<txId>`.

---

## Phase 7 — Bazaar discovery (stretch goal)

Register each worker's `{capability, endpoint, price, payTo}` in the x402 Bazaar registry
(`@x402-avm/extensions`) at startup, and have the orchestrator query the registry instead of
hardcoding `localhost:4021` etc. Only tackle this after Phases 2–5 work — it's additive, not
required for a working demo.

---

## Folder structure

```
research-mesh/
  scripts/
    generate-wallets.js       # one-off: creates 4 testnet accounts
  workers/
    search-agent/             # DONE FIRST — x402-gated /search endpoint
    summarizer-agent/         # copy of search-agent, different route+logic
    fact-checker-agent/       # copy of search-agent, different route+logic
  orchestrator/               # LLM planner + x402 client that pays the workers
  frontend/                   # (add later) demo UI
```

## Before you submit

- Push this to a **public** GitHub repo (open-source is a requirement).
- Record a short demo (screen capture is fine) showing a real payment settling on testnet —
  judges will want to see the 402 → pay → 200 flow actually happen, not just code.
- Keep the core idea in your demo aligned with what you submitted in the idea-selection round.
