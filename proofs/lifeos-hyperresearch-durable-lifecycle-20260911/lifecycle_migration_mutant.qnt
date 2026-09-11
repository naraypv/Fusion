// Author: Naray Puthillathu
module lifecycle_migration_mutant {
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
    verificationReads: 0, conflictObserved: false, outcome: "pending", success: false,
  }
  action inspectDifferent = all {
    s.phase == "new",
    s' = {...s, phase: "inspected", legacyPresent: true, intendedFields: 6,
      initialDurable: "different", durableKind: "different",
      durableVisibleFields: 6, durableRevision: 1},
  }
  action overwriteAndDelete = all {
    s.phase == "inspected",
    s' = {...s, phase: "done", legacyIntact: false,
      durableKind: "identical", durableVisibleFields: 3,
      durableRevision: 2, writes: 1, outcome: "migrated", success: true},
  }
  action step = any {
    inspectDifferent, overwriteAndDelete, all { s.phase == "done", s' = s },
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
    ambiguityIsNotSuccess and conflictNeverPublishesThisWriter and missingLegacyNeverWrites
}
