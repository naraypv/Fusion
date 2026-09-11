# Isolated LifeOS HyperResearch durable-cutover proof

This branch contains only the three generic Quint models copied byte-for-byte
from LifeOS commit `ac420e112e4752f795864fb92c64465d4944cb9a`.

No LifeOS Rust implementation, credentials, configuration, project content,
evidence text, legacy registry state, or Akashic data is present. The workflow
checks the exact Git blob identities before executing pinned Quint 0.32.0.

Post-implementation surrogate target: LifeOS commit
`7bd33222665c53db2c8f914f07253790cd77c7eb`. The three model blobs are
unchanged; this marker records temporal ordering and triggers the same proof and
mutant-counterexample gate. It is not a proof of the Rust implementation.
