// scripts/optin-asset.js
// Usage: node scripts/optin-asset.js "<mnemonic words>" [assetId]
const algosdk = require("algosdk");

async function main() {
  const mnemonic = process.argv[2];
  const assetId = Number(process.argv[3] || 10458941);
  if (!mnemonic) throw new Error('Usage: node optin-asset.js "<mnemonic words>" [assetId]');

  const account = algosdk.mnemonicToSecretKey(mnemonic);
  const algod = new algosdk.Algodv2("", "https://testnet-api.algonode.cloud", "");
  const suggestedParams = await algod.getTransactionParams().do();

  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: account.addr,
    receiver: account.addr,
    amount: 0,
    assetIndex: assetId,
    suggestedParams,
  });

  const signedTxn = txn.signTxn(account.sk);
  const { txid } = await algod.sendRawTransaction(signedTxn).do();
  console.log("Opt-in submitted:", txid);
  await algosdk.waitForConfirmation(algod, txid, 4);
  console.log("Opted in to asset", assetId, "for", account.addr.toString());
}

main().catch(console.error);
