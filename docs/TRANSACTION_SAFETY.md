# Marketplace transaction safety

The native list, buy, delist, and change-price flows currently depend on marketplace-generated Solana transactions.

The recovered production source shows that the marketplace may sign before the transaction reaches the browser. Phantom documents that multi-signer transactions should be signed by Phantom first with `signTransaction`, followed by collection of the other signatures. Phantom also recommends simulation with `sigVerify: false` before presenting the signing request.

Publishing this repository does not by itself remove transaction warnings. The remediation must be tested across all four operations:

1. obtain an unsigned transaction or instruction set;
2. simulate it with signature verification disabled;
3. have the connected wallet sign first;
4. collect any marketplace signature afterward;
5. submit only after signer, account, amount, and simulation checks pass.

Until that flow is proven, transaction-warning remediation remains an open release task. No user should interpret repository visibility as a guarantee that a wallet prompt is safe.
