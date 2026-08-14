# Fact-Checker Agent — TODO (Phase 4)

Not built yet. Once `workers/search-agent` is working end-to-end (402 → pay → 200 proven),
copy it into this folder and change:

- Route: `GET /verify` instead of `GET /search`
- Price: something cheap, e.g. `$0.005`
- Handler: instead of `mockSearch()`, take a claim + supporting sources and ask an LLM to
  return `{ verdict: "supported" | "unsupported" | "uncertain", confidence: 0-1, reasoning }`
- Port: use `4023` (Search Agent uses `4021`, Summarizer uses `4022`)
- `.env`: `FACT_CHECKER_AGENT_ALGO_ADDRESS` instead of `SEARCH_AGENT_ALGO_ADDRESS`

Same x402 middleware wiring, same pattern — just different route + handler logic.
