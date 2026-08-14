// scripts/send-algo.js
// Usage: node scripts/send-algo.js "<sender mnemonic>" <receiverAddress> <amountInAlgo>
const algosdk = require("algosdk");

async function main() {
  const [mnemonic, receiver, amountAlgo] = process.argv.slice(2);
  if (!mnemonic || !receiver || !amountAlgo) {
    throw new Error('Usage: node send-algo.js "<mnemonic>" <receiverAddress> <amountInAlgo>');
  }

  const account = algosdk.mnemonicToSecretKey(mnemonic);
  const algod = new algosdk.Algodv2("", "https://testnet-api.algonode.cloud", "");
  const suggestedParams = await algod.getTransactionParams().do();

  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: account.addr,
    receiver: receiver,
    amount: Math.round(Number(amountAlgo) * 1_000_000), // microAlgos
    suggestedParams,
  });

  const signedTxn = txn.signTxn(account.sk);
  const { txid } = await algod.sendRawTransaction(signedTxn).do();
  console.log("Payment submitted:", txid);
  await algosdk.waitForConfirmation(algod, txid, 4);
  console.log(`Sent ${amountAlgo} ALGO to ${receiver}`);
}

main().catch(console.error);
