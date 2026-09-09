# Isolated LifeOS HyperResearch evidence proof

This branch contains only three generic Quint models copied from the private
LifeOS working tree for the provider-neutral evidence-acquisition boundary.
No LifeOS implementation, configuration, credentials, research project data,
vault content, or Akashic data is included.

The workflow verifies the exact SHA-256 of each model before running pinned
Quint 0.32.0. It typechecks the positive and mutant models, runs ten witnesses,
samples the positive model, exhaustively verifies the positive model with TLC,
and requires TLC to reject the deliberately broken partial-publication mutant.
Evidence is uploaded as a workflow artifact and later copied into the private
LifeOS specification subtree with a receipt.
