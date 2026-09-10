// Author: Naray Puthillathu
// Finite abstraction of immutable HyperResearch project revisions.
// Filesystem calls, JSON parsing, hashing and fsync are runtime concerns.
module project_store {
  type Writer = {
    phase: str,
    expected: int,
    target: int,
  }

  type State = {
    current: int,
    slot1Owner: int,
    slot2Owner: int,
    writerA: Writer,
    writerB: Writer,
    head: int,
    headCorrupt: bool,
    readDone: bool,
    readRevision: int,
    readOwner: int,
  }

  var s: State

  pure def idleWriter(): Writer = { phase: "idle", expected: 0, target: 0 }

  action init = s' = {
    current: 0,
    slot1Owner: 0,
    slot2Owner: 0,
    writerA: idleWriter(),
    writerB: idleWriter(),
    head: 0,
    headCorrupt: false,
    readDone: false,
    readRevision: 0,
    readOwner: 0,
  }

  pure def targetFor(expected: int): int = expected + 1

  action stageA(expected: int): bool = all {
    s.writerA.phase == "idle",
    Set(0, 1).contains(expected),
    s' = {...s,
      writerA: { phase: "staged", expected: expected, target: targetFor(expected) },
    },
  }

  action stageB(expected: int): bool = all {
    s.writerB.phase == "idle",
    Set(0, 1).contains(expected),
    s' = {...s,
      writerB: { phase: "staged", expected: expected, target: targetFor(expected) },
    },
  }

  pure def slotFree(x: State, target: int): bool =
    if (target == 1) x.slot1Owner == 0 else x.slot2Owner == 0

  action publishA = all {
    s.writerA.phase == "staged",
    s.writerA.expected == s.current,
    s.writerA.target <= 2,
    slotFree(s, s.writerA.target),
    s' = if (s.writerA.target == 1)
      {...s,
        current: 1,
        slot1Owner: 1,
        writerA: {...s.writerA, phase: "published"},
      }
    else
      {...s,
        current: 2,
        slot2Owner: 1,
        writerA: {...s.writerA, phase: "published"},
      },
  }

  action publishB = all {
    s.writerB.phase == "staged",
    s.writerB.expected == s.current,
    s.writerB.target <= 2,
    slotFree(s, s.writerB.target),
    s' = if (s.writerB.target == 1)
      {...s,
        current: 1,
        slot1Owner: 2,
        writerB: {...s.writerB, phase: "published"},
      }
    else
      {...s,
        current: 2,
        slot2Owner: 2,
        writerB: {...s.writerB, phase: "published"},
      },
  }

  action conflictA = all {
    s.writerA.phase == "staged",
    s.writerA.expected != s.current or not(slotFree(s, s.writerA.target)),
    s' = {...s, writerA: {...s.writerA, phase: "conflict"}},
  }

  action conflictB = all {
    s.writerB.phase == "staged",
    s.writerB.expected != s.current or not(slotFree(s, s.writerB.target)),
    s' = {...s, writerB: {...s.writerB, phase: "conflict"}},
  }

  action acknowledgeA = all {
    s.writerA.phase == "published",
    s' = {...s, writerA: {...s.writerA, phase: "acknowledged"}},
  }

  action acknowledgeB = all {
    s.writerB.phase == "published",
    s' = {...s, writerB: {...s.writerB, phase: "acknowledged"}},
  }

  action crashBeforeA = all {
    s.writerA.phase == "staged",
    s' = {...s, writerA: {...s.writerA, phase: "failed"}},
  }

  action crashBeforeB = all {
    s.writerB.phase == "staged",
    s' = {...s, writerB: {...s.writerB, phase: "failed"}},
  }

  action crashAfterA = all {
    s.writerA.phase == "published",
    s' = {...s, writerA: {...s.writerA, phase: "unknown"}},
  }

  action crashAfterB = all {
    s.writerB.phase == "published",
    s' = {...s, writerB: {...s.writerB, phase: "unknown"}},
  }

  action refreshHead = all {
    s.current > 0,
    s' = {...s, head: s.current, headCorrupt: false},
  }

  action loseHead = all {
    s' = {...s, head: 0, headCorrupt: false},
  }

  action corruptHead = all {
    s' = {...s, head: 2, headCorrupt: true},
  }

  pure def ownerAt(x: State, revision: int): int =
    if (revision == 1) x.slot1Owner
    else if (revision == 2) x.slot2Owner
    else 0

  action readLatest = all {
    s' = {...s,
      readDone: true,
      readRevision: s.current,
      readOwner: ownerAt(s, s.current),
    },
  }

  action step = any {
    {
      nondet expected = Set(0, 1).oneOf()
      stageA(expected)
    },
    {
      nondet expected = Set(0, 1).oneOf()
      stageB(expected)
    },
    publishA,
    publishB,
    conflictA,
    conflictB,
    acknowledgeA,
    acknowledgeB,
    crashBeforeA,
    crashBeforeB,
    crashAfterA,
    crashAfterB,
    refreshHead,
    loseHead,
    corruptHead,
    readLatest,
  }

  val revisionBounds = s.current >= 0 and s.current <= 2
  val chainIsContiguous =
    (s.current == 0 implies (s.slot1Owner == 0 and s.slot2Owner == 0)) and
    (s.current == 1 implies (s.slot1Owner > 0 and s.slot2Owner == 0)) and
    (s.current == 2 implies (s.slot1Owner > 0 and s.slot2Owner > 0))
  val ownersAreBounded =
    Set(0, 1, 2).contains(s.slot1Owner) and Set(0, 1, 2).contains(s.slot2Owner)
  val acknowledgementsReferencePublishedSlots =
    (s.writerA.phase == "acknowledged" implies ownerAt(s, s.writerA.target) == 1) and
    (s.writerB.phase == "acknowledged" implies ownerAt(s, s.writerB.target) == 2)
  val unknownMeansPublicationMayAlreadyExist =
    (s.writerA.phase == "unknown" implies ownerAt(s, s.writerA.target) == 1) and
    (s.writerB.phase == "unknown" implies ownerAt(s, s.writerB.target) == 2)
  val oneOwnerPerRevision =
    not(s.writerA.target == s.writerB.target and
      Set("published", "acknowledged", "unknown").contains(s.writerA.phase) and
      Set("published", "acknowledged", "unknown").contains(s.writerB.phase))
  val readIgnoresAdvisoryHead =
    s.readDone implies (
      s.readRevision == s.current and s.readOwner == ownerAt(s, s.current))
  val noStagedRevisionIsVisible =
    s.readDone and s.readRevision > 0 implies s.readOwner > 0
  val headNeverCreatesARevision =
    (not(s.headCorrupt) and s.head > 0) implies s.head <= s.current

  val invariant = revisionBounds and chainIsContiguous and ownersAreBounded and
    acknowledgementsReferencePublishedSlots and unknownMeansPublicationMayAlreadyExist and
    oneOwnerPerRevision and readIgnoresAdvisoryHead and noStagedRevisionIsVisible and
    headNeverCreatesARevision
}
