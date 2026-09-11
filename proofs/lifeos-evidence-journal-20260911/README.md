# Isolated LifeOS evidence-journal proof

This branch contains only three generic Quint files copied byte-for-byte from
`naraypv/lifeos` commit `dac501a6896495e6207d23920b3ae2ceefad0ab8`.
No LifeOS implementation, configuration, credential, vault content, research
project data, source text, or Akashic data is included.

The workflow checks the exact Git blob identities, installs pinned Quint 0.32.0,
typechecks both models, runs ten witnesses and 5,000 sampled traces, exhaustively
verifies the positive model with TLC, and requires the unchanged invariant to
reject the deliberately unsafe partial-publication mutant.

Final post-implementation surrogate recheck target: LifeOS source/test commit
`188cdec7e0844e96a29d896905c66a104387b09c`, which adds real different-batch
writer races after the production journal implementation. Later documentation,
receipt, verifier, and workflow commits do not modify journal Rust source or
tests. This records temporal ordering only; the finite model is not a proof of
the Rust program.
