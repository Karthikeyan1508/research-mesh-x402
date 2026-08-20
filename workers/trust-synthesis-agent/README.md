# Trust Synthesis Agent

An x402-gated endpoint that synthesizes/summarizes text using an LLM.

- Route: `POST /synthesize`
- Price: `$0.005`
- Handler: Calls Gemini API to summarize text in 3-4 sentences and returns `{ summary }`
- Port: `4022`
- Env Variable: `TRUST_SYNTHESIS_AGENT_ALGO_ADDRESS`

Settles on Algorand testnet using the GoPlausible facilitator.
