# Summarizer Agent — TODO (Phase 4)

Not built yet. Once `workers/search-agent` is working end-to-end (402 → pay → 200 proven),
copy it into this folder and change:

- Route: `GET /summarize` instead of `GET /search`
- Price: something cheap, e.g. `$0.005`
- Handler: instead of `mockSearch()`, call an LLM (Claude/OpenAI) with a prompt like
  "Summarize the following in 3-4 sentences: {text}" and return `{ summary }`
- Port: use `4022` (Search Agent uses `4021`) so they can run side by side
- `.env`: `SUMMARIZER_AGENT_ALGO_ADDRESS` instead of `SEARCH_AGENT_ALGO_ADDRESS`

Same x402 middleware wiring, same pattern — just different route + handler logic.
