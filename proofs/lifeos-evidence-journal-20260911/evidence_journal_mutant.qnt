// Author: Naray Puthillathu
// Deliberately unsafe implementation: one passage becomes visible before the
// two-passage batch is committed. The production invariant must reject it.
module evidence_journal_mutant {
  type State = {
    phase: str,
    batchItems: int,
    documentValid: bool,
    initialIdPresent: bool,
    initialIdentityEqual: bool,
    initialReads: int,
    writeAttempts: int,
    reconcileReads: int,
    externalKind: str,
    batchVisible: bool,
    visibleItems: int,
    revisionDelta: int,
    outcome: str,
  }

  var s: State

  action init = s' = {
    phase: "prepared",
    batchItems: 2,
    documentValid: true,
    initialIdPresent: false,
    initialIdentityEqual: false,
    initialReads: 1,
    writeAttempts: 0,
    reconcileReads: 0,
    externalKind: "none",
    batchVisible: false,
    visibleItems: 0,
    revisionDelta: 0,
    outcome: "none",
  }

  action publishFirstPassage = all {
    s.phase == "prepared",
    s' = {...s,
      phase: "partial",
      writeAttempts: 1,
      batchVisible: false,
      visibleItems: 1,
      revisionDelta: 1,
    },
  }

  action failRemainingPassage = all {
    s.phase == "partial",
    s' = {...s, phase: "done", outcome: "conflict"},
  }

  action step = any {
    publishFirstPassage,
    failRemainingPassage,
    all { s.phase == "done", s' = s },
  }

  val boundedCounters =
    Set(0, 1, 2).contains(s.batchItems) and
    Set(0, 1).contains(s.initialReads) and
    Set(0, 1).contains(s.writeAttempts) and
    Set(0, 1).contains(s.reconcileReads) and
    Set(0, 1).contains(s.revisionDelta)

  val wholeBatchVisibility =
    s.visibleItems == 0 or s.visibleItems == s.batchItems

  val visibleFlagMatchesItems =
    s.batchVisible == (s.batchItems > 0 and s.visibleItems == s.batchItems)

  val emptyUsesNoStore =
    (s.outcome == "empty") implies
      (s.batchItems == 0 and s.initialReads == 0 and s.writeAttempts == 0 and
        s.reconcileReads == 0 and s.revisionDelta == 0 and not(s.batchVisible))

  val appendIsFullyPublished =
    (s.outcome == "appended") implies
      (s.batchItems > 0 and s.documentValid and not(s.initialIdPresent) and
        s.initialReads == 1 and s.writeAttempts == 1 and
        s.reconcileReads == 0 and s.revisionDelta == 1 and
        s.batchVisible and s.visibleItems == s.batchItems)

  val replayIsObservedNotRewritten =
    (s.outcome == "already" and s.externalKind == "none") implies
      (s.initialIdentityEqual and s.initialReads == 1 and
        s.writeAttempts == 0 and s.reconcileReads == 0 and s.batchVisible)

  val sameRaceConvergesAfterOneRead =
    (s.outcome == "already" and s.externalKind == "same") implies
      (s.writeAttempts == 1 and s.reconcileReads == 1 and
        s.revisionDelta == 1 and s.batchVisible and
        s.visibleItems == s.batchItems)

  val differentRaceNeverSucceeds =
    (s.externalKind == "different") implies
      (s.outcome != "appended" and s.outcome != "already" and
        not(s.batchVisible) and s.visibleItems == 0)

  val conflictIsBoundedAndExplicit =
    (s.outcome == "conflict") implies
      (s.externalKind == "different" and s.writeAttempts == 1 and
        s.reconcileReads == 1 and s.revisionDelta == 1)

  val ambiguityIsNeverSuccess =
    (s.outcome == "unknown") implies
      (s.writeAttempts == 1 and s.reconcileReads == 0 and
        s.outcome != "appended" and s.outcome != "already")

  val collisionFailsClosed =
    (s.initialIdPresent and not(s.initialIdentityEqual) and
      s.phase == "done") implies
      (s.outcome == "corrupt" and s.writeAttempts == 0 and
        s.reconcileReads == 0 and not(s.batchVisible))

  val noAutomaticRetry = s.writeAttempts <= 1 and s.reconcileReads <= 1

  val invariant =
    boundedCounters and wholeBatchVisibility and visibleFlagMatchesItems and
    emptyUsesNoStore and appendIsFullyPublished and replayIsObservedNotRewritten and
    sameRaceConvergesAfterOneRead and differentRaceNeverSucceeds and
    conflictIsBoundedAndExplicit and ambiguityIsNeverSuccess and
    collisionFailsClosed and noAutomaticRetry
}
