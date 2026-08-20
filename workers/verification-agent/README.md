# Verification Agent

An x402-gated endpoint that verifies claims using an LLM.

- Route: `POST /verify`
- Price: `$0.005`
- Handler: Calls Gemini API to verify a claim and returns a JSON response with the verdict, confidence, and reasoning.
- Port: `4023`
- Env Variable: `VERIFICATION_AGENT_ALGO_ADDRESS`

Settles on Algorand testnet using the GoPlausible facilitator.
