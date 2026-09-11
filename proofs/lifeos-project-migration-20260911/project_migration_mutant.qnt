// Author: Naray Puthillathu
// Deliberately unsafe migration: deletes the legacy source and overwrites a
// divergent durable destination. The production invariant must reject it.
module project_migration_mutant {
  type State = {
    phase: str,
    operation: str,
    legacyPresent: bool,
    legacyIntact: bool,
    candidateSource: str,
    initialOrigin: str,
    durableOrigin: str,
    writeAttempts: int,
    reconcileReads: int,
    ownRevisionWrites: int,
    expectedMatches: bool,
    inputValid: bool,
    mutationKind: str,
    stageBefore: int,
    stageAfter: int,
    findingsBefore: int,
    findingsAfter: int,
    journalAssociationStable: bool,
    outcome: str,
  }

  var s: State

  action init = s' = {
    phase: "loaded",
    operation: "migration",
    legacyPresent: true,
    legacyIntact: true,
    candidateSource: "source-a",
    initialOrigin: "other",
    durableOrigin: "other",
    writeAttempts: 0,
    reconcileReads: 0,
    ownRevisionWrites: 0,
    expectedMatches: false,
    inputValid: true,
    mutationKind: "none",
    stageBefore: 0,
    stageAfter: 0,
    findingsBefore: 0,
    findingsAfter: 0,
    journalAssociationStable: true,
    outcome: "none",
  }

  action destructiveOverwrite = all {
    s.phase == "loaded",
    s' = {...s,
      phase: "done",
      legacyIntact: false,
      durableOrigin: s.candidateSource,
      writeAttempts: 1,
      ownRevisionWrites: 1,
      outcome: "migrated",
    },
  }

  action step = any {
    destructiveOverwrite,
    all { s.phase == "done", s' = s },
  }

  val boundedEffects =
    Set(0, 1).contains(s.writeAttempts) and
    Set(0, 1).contains(s.reconcileReads) and
    Set(0, 1).contains(s.ownRevisionWrites)
  val legacyIsCopyOnly = s.legacyIntact
  val migratedMatchesSource =
    (s.outcome == "migrated") implies
      (s.legacyPresent and s.durableOrigin == s.candidateSource and
        s.writeAttempts == 1 and s.ownRevisionWrites == 1 and
        s.reconcileReads == 0)
  val alreadyIsObservedMatch =
    (s.outcome == "already") implies
      (s.legacyPresent and s.durableOrigin == s.candidateSource and
        s.ownRevisionWrites == 0)
  val divergentDestinationNeverOverwritten =
    (s.operation == "migration" and
      Set("other", "native").contains(s.initialOrigin)) implies
      (s.writeAttempts == 0 and s.ownRevisionWrites == 0 and
        s.durableOrigin != s.candidateSource)
  val migrationConflictIsNotSuccess =
    (s.outcome == "migration-conflict") implies
      (s.durableOrigin != s.candidateSource and s.outcome != "migrated" and
        s.outcome != "already")
  val migrationReconciliationIsBounded =
    s.reconcileReads <= 1 and
    (s.reconcileReads == 1 implies s.writeAttempts == 1)
  val invalidOrStaleMutationWritesNothing =
    Set("invalid", "conflict").contains(s.outcome) implies
      (s.writeAttempts == 0 and s.ownRevisionWrites == 0 and
        s.stageAfter == s.stageBefore and s.findingsAfter == s.findingsBefore)
  val successfulMutationIsExact =
    (s.operation == "mutation" and s.outcome == "updated") implies
      (s.inputValid and s.expectedMatches and s.writeAttempts == 1 and
        s.ownRevisionWrites == 1 and
        ((s.mutationKind == "advance" and
            s.stageAfter == s.stageBefore + 1 and
            s.findingsAfter == s.findingsBefore) or
         (s.mutationKind == "finding" and
            s.findingsAfter == s.findingsBefore + 1 and
            s.stageAfter == s.stageBefore)))
  val stageNeverReverses = s.stageAfter >= s.stageBefore
  val findingsNeverDisappear = s.findingsAfter >= s.findingsBefore
  val unknownIsNeverSuccess =
    (s.outcome == "unknown") implies
      (s.outcome != "migrated" and s.outcome != "already" and
        s.outcome != "updated")
  val journalAssociationNeverChanges = s.journalAssociationStable

  val invariant =
    boundedEffects and legacyIsCopyOnly and migratedMatchesSource and
    alreadyIsObservedMatch and divergentDestinationNeverOverwritten and
    migrationConflictIsNotSuccess and migrationReconciliationIsBounded and
    invalidOrStaleMutationWritesNothing and successfulMutationIsExact and
    stageNeverReverses and findingsNeverDisappear and unknownIsNeverSuccess and
    journalAssociationNeverChanges
}
