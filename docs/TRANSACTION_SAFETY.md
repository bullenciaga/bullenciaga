# Wallet and transaction safety

Connecting a wallet and approving a transaction are separate actions. The
website's collection and marketplace interfaces may request signatures through
the connected wallet. Review the requested action, asset, destination and amount
in the wallet before approving.

Marketplace transactions can be supplied by external services. The relevant
browser code is public for inspection, but this repository is not an independent
audit of those services or a guarantee that every signing request is safe.

A wallet warning should not be dismissed merely because a website is listed,
has public source or appears in a familiar collection. If a request differs
from the action you intended, reject it and report the issue privately using
[SECURITY.md](../SECURITY.md).

No recovery phrase or private key belongs in a support request, GitHub issue or
website form. The canonical mint and website links are listed in the
[README](../README.md).
