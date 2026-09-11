# Isolated LifeOS evidence-journal proof

This branch contains only three generic Quint files copied byte-for-byte from
`naraypv/lifeos` commit `dac501a6896495e6207d23920b3ae2ceefad0ab8`.
No LifeOS implementation, configuration, credential, vault content, research
project data, source text, or Akashic data is included.

The workflow checks the exact Git blob identities, installs pinned Quint 0.32.0,
typechecks both models, runs ten witnesses and 5,000 sampled traces, exhaustively
verifies the positive model with TLC, and requires the unchanged invariant to
reject the deliberately unsafe partial-publication mutant.

Post-implementation surrogate recheck target: LifeOS production-source commit
`7cb641058b5deeb58c82ecdcc35247efb4aa9f38`. Later documentation, verifier,
and workflow commits do not modify the journal Rust implementation. This records
temporal ordering only; the finite model is not a proof of the Rust program.
