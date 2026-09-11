// Author: Naray Puthillathu
// Finite abstraction of one durable evidence-journal append. Serialization,
// hashing, Rust behavior and filesystem durability are tested separately.
module evidence_journal {
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
    phase: "new",
    batchItems: 0,
    documentValid: false,
    initialIdPresent: false,
    initialIdentityEqual: false,
    initialReads: 0,
    writeAttempts: 0,
    reconcileReads: 0,
    externalKind: "none",
    batchVisible: false,
    visibleItems: 0,
    revisionDelta: 0,
    outcome: "none",
  }

  action begin(items: int): bool = all {
    s.phase == "new",
    Set(0, 1, 2).contains(items),
    s' = {...s, phase: "preflight", batchItems: items},
  }

  action emptyNoop = all {
    s.phase == "preflight",
    s.batchItems == 0,
    s' = {...s, phase: "done", outcome: "empty"},
  }

  action load(valid: bool, idPresent: bool, identityEqual: bool): bool = all {
    s.phase == "preflight",
    s.batchItems > 0,
    identityEqual implies idPresent,
    s' = {...s,
      phase: "loaded",
      documentValid: valid,
      initialIdPresent: idPresent,
      initialIdentityEqual: identityEqual,
      initialReads: 1,
      batchVisible: valid and identityEqual,
      visibleItems: if (valid and identityEqual) s.batchItems else 0,
    },
  }

  action rejectCorrupt = all {
    s.phase == "loaded",
    not(s.documentValid),
    s' = {...s, phase: "done", outcome: "corrupt"},
  }

  action rejectCollision = all {
    s.phase == "loaded",
    s.documentValid,
    s.initialIdPresent,
    not(s.initialIdentityEqual),
    s' = {...s, phase: "done", outcome: "corrupt"},
  }

  action replay = all {
    s.phase == "loaded",
    s.documentValid,
    s.initialIdentityEqual,
    s' = {...s, phase: "done", outcome: "already"},
  }

  action prepare = all {
    s.phase == "loaded",
    s.documentValid,
    not(s.initialIdPresent),
    s' = {...s, phase: "prepared"},
  }

  action commitSuccess = all {
    s.phase == "prepared",
    s' = {...s,
      phase: "done",
      writeAttempts: 1,
      batchVisible: true,
      visibleItems: s.batchItems,
      revisionDelta: 1,
      outcome: "appended",
    },
  }

  action commitUnknown(published: bool): bool = all {
    s.phase == "prepared",
    s' = {...s,
      phase: "done",
      writeAttempts: 1,
      batchVisible: published,
      visibleItems: if (published) s.batchItems else 0,
      revisionDelta: if (published) 1 else 0,
      outcome: "unknown",
    },
  }

  action commitConflictSame = all {
    s.phase == "prepared",
    s' = {...s,
      phase: "reconcile-same",
      writeAttempts: 1,
      externalKind: "same",
      batchVisible: true,
      visibleItems: s.batchItems,
      revisionDelta: 1,
    },
  }

  action commitConflictDifferent = all {
    s.phase == "prepared",
    s' = {...s,
      phase: "reconcile-different",
      writeAttempts: 1,
      externalKind: "different",
      batchVisible: false,
      visibleItems: 0,
      revisionDelta: 1,
    },
  }

  action reconcileSame = all {
    s.phase == "reconcile-same",
    s' = {...s,
      phase: "done",
      reconcileReads: 1,
      outcome: "already",
    },
  }

  action reconcileDifferent = all {
    s.phase == "reconcile-different",
    s' = {...s,
      phase: "done",
      reconcileReads: 1,
      outcome: "conflict",
    },
  }

  action step = any {
    {
      nondet items = Set(0, 1, 2).oneOf()
      begin(items)
    },
    emptyNoop,
    {
      nondet valid = Set(false, true).oneOf()
      nondet idPresent = Set(false, true).oneOf()
      nondet identityEqual = Set(false, true).oneOf()
      load(valid, idPresent, identityEqual)
    },
    rejectCorrupt,
    rejectCollision,
    replay,
    prepare,
    commitSuccess,
    {
      nondet published = Set(false, true).oneOf()
      commitUnknown(published)
    },
    commitConflictSame,
    commitConflictDifferent,
    reconcileSame,
    reconcileDifferent,
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
