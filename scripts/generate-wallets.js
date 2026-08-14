// One-off script: generates 4 Algorand testnet accounts (orchestrator + 3 workers).
// Run: node scripts/generate-wallets.js
// Copy the printed addresses/mnemonics into each service's .env file.
// Then fund each ADDRESS via the AlgoKit testnet dispenser before running anything.

const algosdk = require("algosdk");

const roles = ["orchestrator", "search-agent", "summarizer-agent", "fact-checker-agent"];

console.log("Generating 4 Algorand testnet accounts...\n");

for (const role of roles) {
  const account = algosdk.generateAccount();
  const mnemonic = algosdk.secretKeyToMnemonic(account.sk);
  console.log(`# ${role}`);
  console.log(`ADDRESS=${account.addr}`);
  console.log(`MNEMONIC="${mnemonic}"`);
  console.log("");
}

console.log("Next steps:");
console.log("1. Fund each ADDRESS with testnet ALGO + USDC via the AlgoKit dispenser.");
console.log("2. Paste the relevant ADDRESS/MNEMONIC pair into each service's .env file.");
console.log("3. Never commit these to git — .env is already gitignored.");
