// Author: Naray Puthillathu
// Deliberately unsafe store: a second writer overwrites revision 1 and both
// writers may receive acknowledgement. The shared safety property must fail.
module project_store_mutant {
  type Writer = { phase: str, expected: int, target: int }
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
  pure val idleWriter: Writer = { phase: "idle", expected: 0, target: 0 }
  action init = s' = {
    current: 0, slot1Owner: 0, slot2Owner: 0,
    writerA: idleWriter, writerB: idleWriter, head: 0,
    headCorrupt: false, readDone: false, readRevision: 0, readOwner: 0,
  }
  pure def ownerAt(x: State, revision: int): int =
    if (revision == 1) x.slot1Owner else if (revision == 2) x.slot2Owner else 0

  action stageBoth = all {
    s' = {...s,
      writerA: { phase: "staged", expected: 0, target: 1 },
      writerB: { phase: "staged", expected: 0, target: 1 },
      readDone: false,
    },
  }
  action publishA = all {
    s.writerA.phase == "staged",
    s' = {...s, current: 1, slot1Owner: 1,
      writerA: {...s.writerA, phase: "acknowledged"}, readDone: false},
  }
  action overwriteWithB = all {
    s.writerB.phase == "staged",
    s.current == 1,
    s' = {...s, slot1Owner: 2,
      writerB: {...s.writerB, phase: "acknowledged"}, readDone: false},
  }
  action readLatest = all {
    s' = {...s, readDone: true, readRevision: s.current,
      readOwner: ownerAt(s, s.current)},
  }
  action step = any { stageBoth, publishA, overwriteWithB, readLatest }

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
  val unknownMeansPublicationMayAlreadyExist = true
  val oneOwnerPerRevision =
    not(s.writerA.target == s.writerB.target and
      Set("published", "acknowledged", "unknown").contains(s.writerA.phase) and
      Set("published", "acknowledged", "unknown").contains(s.writerB.phase))
  val readIgnoresAdvisoryHead =
    s.readDone implies (s.readRevision == s.current and s.readOwner == ownerAt(s, s.current))
  val noStagedRevisionIsVisible =
    s.readDone and s.readRevision > 0 implies s.readOwner > 0
  val headNeverCreatesARevision =
    (not(s.headCorrupt) and s.head > 0) implies s.head <= s.current
  val invariant = revisionBounds and chainIsContiguous and ownersAreBounded and
    acknowledgementsReferencePublishedSlots and unknownMeansPublicationMayAlreadyExist and
    oneOwnerPerRevision and readIgnoresAdvisoryHead and noStagedRevisionIsVisible and
    headNeverCreatesARevision
}
