// Author: Naray Puthillathu
// Finite abstraction of copy-only legacy migration and exact-revision durable
// lifecycle updates. Hashing, Rust, serialization and filesystem behavior are
// verified separately.
module project_migration {
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
    phase: "new",
    operation: "none",
    legacyPresent: false,
    legacyIntact: true,
    candidateSource: "none",
    initialOrigin: "none",
    durableOrigin: "none",
    writeAttempts: 0,
    reconcileReads: 0,
    ownRevisionWrites: 0,
    expectedMatches: false,
    inputValid: false,
    mutationKind: "none",
    stageBefore: 0,
    stageAfter: 0,
    findingsBefore: 0,
    findingsAfter: 0,
    journalAssociationStable: true,
    outcome: "none",
  }

  action beginMigration(source: str, destination: str): bool = all {
    s.phase == "new",
    Set("source-a", "source-b").contains(source),
    Set("absent", "same", "other", "native").contains(destination),
    s' = {...s,
      phase: "migration-loaded",
      operation: "migration",
      legacyPresent: true,
      legacyIntact: true,
      candidateSource: source,
      initialOrigin: destination,
      durableOrigin:
        if (destination == "absent") "none"
        else if (destination == "same") source
        else destination,
      inputValid: true,
    },
  }

  action migrationAlready = all {
    s.phase == "migration-loaded",
    s.initialOrigin == "same",
    s' = {...s, phase: "done", outcome: "already"},
  }

  action migrationExistingConflict = all {
    s.phase == "migration-loaded",
    Set("other", "native").contains(s.initialOrigin),
    s' = {...s, phase: "done", outcome: "migration-conflict"},
  }

  action migrationPrepare = all {
    s.phase == "migration-loaded",
    s.initialOrigin == "absent",
    s' = {...s, phase: "migration-prepared"},
  }

  action migrationCommit = all {
    s.phase == "migration-prepared",
    s' = {...s,
      phase: "done",
      durableOrigin: s.candidateSource,
      writeAttempts: 1,
      ownRevisionWrites: 1,
      outcome: "migrated",
    },
  }

  action migrationUnknown(published: bool): bool = all {
    s.phase == "migration-prepared",
    s' = {...s,
      phase: "done",
      durableOrigin: if (published) s.candidateSource else "none",
      writeAttempts: 1,
      ownRevisionWrites: if (published) 1 else 0,
      outcome: "unknown",
    },
  }

  action migrationRaceSame = all {
    s.phase == "migration-prepared",
    s' = {...s,
      phase: "migration-reconcile-same",
      durableOrigin: s.candidateSource,
      writeAttempts: 1,
      ownRevisionWrites: 0,
    },
  }

  action migrationRaceDifferent = all {
    s.phase == "migration-prepared",
    s' = {...s,
      phase: "migration-reconcile-different",
      durableOrigin: "other",
      writeAttempts: 1,
      ownRevisionWrites: 0,
    },
  }

  action reconcileSame = all {
    s.phase == "migration-reconcile-same",
    s' = {...s,
      phase: "done",
      reconcileReads: 1,
      outcome: "already",
    },
  }

  action reconcileDifferent = all {
    s.phase == "migration-reconcile-different",
    s' = {...s,
      phase: "done",
      reconcileReads: 1,
      outcome: "migration-conflict",
    },
  }

  action beginMutation(kind: str, expected: bool, valid: bool,
      stage: int, findings: int): bool = all {
    s.phase == "new",
    Set("advance", "finding").contains(kind),
    Set(0, 1, 2, 3, 4).contains(stage),
    Set(0, 1, 2).contains(findings),
    s' = {...s,
      phase: "mutation-loaded",
      operation: "mutation",
      durableOrigin: "native",
      initialOrigin: "native",
      expectedMatches: expected,
      inputValid: valid,
      mutationKind: kind,
      stageBefore: stage,
      stageAfter: stage,
      findingsBefore: findings,
      findingsAfter: findings,
    },
  }

  action rejectInvalidMutation = all {
    s.phase == "mutation-loaded",
    not(s.inputValid),
    s' = {...s, phase: "done", outcome: "invalid"},
  }

  action rejectStaleMutation = all {
    s.phase == "mutation-loaded",
    s.inputValid,
    not(s.expectedMatches),
    s' = {...s, phase: "done", outcome: "conflict"},
  }

  action commitAdvance = all {
    s.phase == "mutation-loaded",
    s.inputValid,
    s.expectedMatches,
    s.mutationKind == "advance",
    s.stageBefore < 4,
    s' = {...s,
      phase: "done",
      stageAfter: s.stageBefore + 1,
      writeAttempts: 1,
      ownRevisionWrites: 1,
      outcome: "updated",
    },
  }

  action commitFinding = all {
    s.phase == "mutation-loaded",
    s.inputValid,
    s.expectedMatches,
    s.mutationKind == "finding",
    s.findingsBefore < 2,
    s' = {...s,
      phase: "done",
      findingsAfter: s.findingsBefore + 1,
      writeAttempts: 1,
      ownRevisionWrites: 1,
      outcome: "updated",
    },
  }

  action mutationUnknown(published: bool): bool = all {
    s.phase == "mutation-loaded",
    s.inputValid,
    s.expectedMatches,
    s' = {...s,
      phase: "done",
      stageAfter:
        if (published and s.mutationKind == "advance" and s.stageBefore < 4)
          s.stageBefore + 1
        else s.stageBefore,
      findingsAfter:
        if (published and s.mutationKind == "finding" and s.findingsBefore < 2)
          s.findingsBefore + 1
        else s.findingsBefore,
      writeAttempts: 1,
      ownRevisionWrites: if (published) 1 else 0,
      outcome: "unknown",
    },
  }

  action step = any {
    {
      nondet source = Set("source-a", "source-b").oneOf()
      nondet destination = Set("absent", "same", "other", "native").oneOf()
      beginMigration(source, destination)
    },
    migrationAlready,
    migrationExistingConflict,
    migrationPrepare,
    migrationCommit,
    {
      nondet published = Set(false, true).oneOf()
      migrationUnknown(published)
    },
    migrationRaceSame,
    migrationRaceDifferent,
    reconcileSame,
    reconcileDifferent,
    {
      nondet kind = Set("advance", "finding").oneOf()
      nondet expected = Set(false, true).oneOf()
      nondet valid = Set(false, true).oneOf()
      nondet stage = Set(0, 1, 2, 3, 4).oneOf()
      nondet findings = Set(0, 1, 2).oneOf()
      beginMutation(kind, expected, valid, stage, findings)
    },
    rejectInvalidMutation,
    rejectStaleMutation,
    commitAdvance,
    commitFinding,
    {
      nondet published = Set(false, true).oneOf()
      mutationUnknown(published)
    },
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
