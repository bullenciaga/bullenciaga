# Public release overview

This repository contains the website's release workflows so readers can inspect
how published source becomes a website release.

A pull request must pass the required `verify` check before merging into `main`.
The staging workflow builds and checks that revision. Production runs only after
a successful automatic staging run for the current main revision, then checks
the deployed pages and API response contracts. A failed post-release check
triggers rollback to the captured prior website version.

GitHub's Actions tab contains public workflow results. A commit or successful
unit test alone does not establish which version is currently serving traffic.

Credentials, account administration and recovery procedures are maintained
outside this public repository. Website releases do not deploy the separate
backend services or change on-chain balances.
