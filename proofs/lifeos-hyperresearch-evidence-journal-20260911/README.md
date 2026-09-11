# Isolated LifeOS HyperResearch evidence-journal proof

This branch contains only three generic Quint state-machine files copied from
the private LifeOS evidence-journal specification. It contains no LifeOS Rust
implementation, configuration, credentials, project data, vault content, or
Akashic data.

The workflow records SHA-256 values, runs pinned Quint 0.32.0, typechecks both
models, executes ten witnesses, samples the positive model, exhaustively checks
the finite positive state graph with TLC, and requires the deliberately unsafe
partial-publication mutant to fail the same invariant.
