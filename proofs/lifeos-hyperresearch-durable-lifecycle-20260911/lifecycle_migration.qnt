// Author: Naray Puthillathu
module lifecycle_migration {
  type State = {
    phase: str, legacyPresent: bool, legacyIntact: bool, intendedFields: int,
    initialDurable: str, durableKind: str, durableVisibleFields: int,
    durableRevision: int, writes: int, verificationReads: int,
    conflictObserved: bool, outcome: str, success: bool,
  }
  var s: State
  action init = s' = {
    phase: "new", legacyPresent: false, legacyIntact: true,
    intendedFields: 0, initialDurable: "absent", durableKind: "absent",
    durableVisibleFields: 0, durableRevision: 0, writes: 0,
    verificationReads: 0, conflictObserved: false, outcome: "pending",
    success: false,
  }
  action inspect(legacy: bool, durable: str): bool = all {
    s.phase == "new", Set("absent", "identical", "different").contains(durable),
    s' = {...s, phase: "inspected", legacyPresent: legacy,
      intendedFields: if (legacy) 6 else 0, initialDurable: durable,
      durableKind: durable,
      durableVisibleFields: if (durable == "absent") 0 else if (legacy) 6 else 1,
      durableRevision: if (durable == "absent") 0 else 1},
  }
  action rejectMissingLegacy = all {
    s.phase == "inspected", not(s.legacyPresent),
    s' = {...s, phase: "done", outcome: "not_found"},
  }
  action recognizeIdentical = all {
    s.phase == "inspected", s.legacyPresent, s.durableKind == "identical",
    s' = {...s, phase: "done", outcome: "already_migrated"},
  }
  action rejectDifferent = all {
    s.phase == "inspected", s.legacyPresent, s.durableKind == "different",
    s' = {...s, phase: "done", outcome: "conflict"},
  }
  action stage = all {
    s.phase == "inspected", s.legacyPresent, s.durableKind == "absent",
    s' = {...s, phase: "staged"},
  }
  action failBeforePublish = all {
    s.phase == "staged", s' = {...s, phase: "done", outcome: "failed"},
  }
  action publish = all {
    s.phase == "staged",
    s' = {...s, phase: "published", durableKind: "identical",
      durableVisibleFields: s.intendedFields, durableRevision: 1, writes: 1},
  }
  action loseConfirmation = all {
    s.phase == "published",
    s' = {...s, phase: "done", outcome: "commit_state_unknown"},
  }
  action verifyExactRevision = all {
    s.phase == "published", s.durableKind == "identical",
    s.durableVisibleFields == s.intendedFields,
    s' = {...s, phase: "done", verificationReads: 1,
      outcome: "migrated", success: true},
  }
  action observeCompetingWinner(same: bool): bool = all {
    s.phase == "staged",
    s' = {...s, phase: "conflict", conflictObserved: true,
      durableKind: if (same) "identical" else "different",
      durableVisibleFields: s.intendedFields, durableRevision: 1},
  }
  action reconcileConflict = all {
    s.phase == "conflict", s.verificationReads == 0,
    s' = {...s, phase: "done", verificationReads: 1,
      outcome: if (s.durableKind == "identical") "already_migrated" else "conflict"},
  }
  action step = any {
    { nondet legacy = Set(false, true).oneOf()
      nondet durable = Set("absent", "identical", "different").oneOf()
      inspect(legacy, durable) },
    rejectMissingLegacy, recognizeIdentical, rejectDifferent, stage,
    failBeforePublish, publish, loseConfirmation, verifyExactRevision,
    { nondet same = Set(false, true).oneOf()
      observeCompetingWinner(same) },
    reconcileConflict, all { s.phase == "done", s' = s },
  }
  val legacyIsNeverDeleted = s.legacyIntact
  val wholeSnapshotVisibility =
    s.durableVisibleFields == 0 or s.durableVisibleFields == s.intendedFields
  val atMostOnePublication = s.writes <= 1
  val atMostOneVerificationRead = s.verificationReads <= 1
  val successRequiresExactVerification = s.success implies
    (s.outcome == "migrated" and s.legacyPresent and s.durableKind == "identical" and
     s.durableVisibleFields == s.intendedFields and s.writes == 1 and
     s.verificationReads == 1)
  val identicalReplayDoesNotWrite =
    (s.outcome == "already_migrated" and not(s.conflictObserved)) implies
      (s.initialDurable == "identical" and s.writes == 0)
  val differentExistingIsNeverOverwritten = s.initialDurable == "different" implies
    (s.writes == 0 and s.durableKind == "different")
  val failedBeforePublishLeavesTargetAbsent = s.outcome == "failed" implies
    (s.initialDurable == "absent" and s.durableKind == "absent" and
     s.durableRevision == 0 and s.writes == 0)
  val ambiguityIsNotSuccess = s.outcome == "commit_state_unknown" implies
    (not(s.success) and s.writes == 1 and s.durableKind == "identical" and s.legacyIntact)
  val conflictNeverPublishesThisWriter = s.conflictObserved implies s.writes == 0
  val missingLegacyNeverWrites = s.outcome == "not_found" implies s.writes == 0
  val invariant = legacyIsNeverDeleted and wholeSnapshotVisibility and
    atMostOnePublication and atMostOneVerificationRead and
    successRequiresExactVerification and identicalReplayDoesNotWrite and
    differentExistingIsNeverOverwritten and failedBeforePublishLeavesTargetAbsent and
    ambiguityIsNotSuccess and conflictNeverPublishesThisWriter and
    missingLegacyNeverWrites
}
