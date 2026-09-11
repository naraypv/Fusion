# Isolated LifeOS durable project-repository proof

This branch contains only three generic Quint models copied byte-for-byte from
`naraypv/lifeos` commit `16504f11b5900ec2de8ad4e2c6413d3985d254e2`.
It contains no LifeOS production source, configuration, credentials, research
project data, vault content, or Akashic data.

The workflow verifies the exact Git blob identity of every model, installs
pinned Quint 0.32.0, typechecks the positive and mutant models, executes fourteen
named witnesses, samples the positive model, exhaustively verifies it with TLC,
and requires TLC to reject the deliberately unsafe duplicate-application
mutant. The evidence artifact is copied back to the private LifeOS branch before
production authoring begins.
