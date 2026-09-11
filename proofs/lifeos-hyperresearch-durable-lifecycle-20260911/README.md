# Isolated LifeOS durable-lifecycle proof

This branch contains only the three generic Quint migration state machines from
the private LifeOS durable-lifecycle specification. It contains no LifeOS Rust
implementation, credentials, configuration, project data, vault content, or
Akashic data.

Pinned Quint 0.32.0 typechecks the positive and mutant models, runs ten named
witnesses, samples the positive model, exhaustively verifies the finite positive
state graph with TLC, and requires the destructive overwrite/delete mutant to
fail the same invariant. Successful output is committed under `evidence/`.
