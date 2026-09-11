// Author: Naray Puthillathu
// Finite abstraction of one durable project command plus optional read-only
// reconciliation. Rust, hashing, JSON and filesystem behavior are tested apart.
module project_repository {
  type State = {
    phase: str,
    commandKind: str,
    legacyPresent: bool,
    projectExists: bool,
    documentValid: bool,
    operationIdPresent: bool,
    operationEqual: bool,
    expectedMatches: bool,
    loadedStage: int,
    loadedFindings: int,
    targetStage: int,
    targetFindings: int,
    stage: int,
    findings: int,
    candidateStage: int,
    candidateFindings: int,
    initialReads: int,
    writeAttempts: int,
    conflictReads: int,
    unknownReads: int,
    externalKind: str,
    operationVisible: bool,
    effectApplications: int,
    revisionDelta: int,
    journalStable: bool,
    outcome: str,
  }

  var s: State

  action init = s' = {
    phase: "new",
    commandKind: "none",
    legacyPresent: false,
    projectExists: false,
    documentValid: false,
    operationIdPresent: false,
    operationEqual: false,
    expectedMatches: false,
    loadedStage: 0,
    loadedFindings: 0,
    targetStage: 0,
    targetFindings: 0,
    stage: 0,
    findings: 0,
    candidateStage: 0,
    candidateFindings: 0,
    initialReads: 0,
    writeAttempts: 0,
    conflictReads: 0,
    unknownReads: 0,
    externalKind: "none",
    operationVisible: false,
    effectApplications: 0,
    revisionDelta: 0,
    journalStable: true,
    outcome: "none",
  }

  action begin(kind: str, targetStage: int, targetFindings: int,
      legacyPresent: bool): bool = all {
    s.phase == "new",
    Set("create", "import", "stage", "finding").contains(kind),
    Set(0, 1, 2, 3, 4).contains(targetStage),
    Set(0, 1, 2).contains(targetFindings),
    s' = {...s,
      phase: "loading",
      commandKind: kind,
      targetStage: targetStage,
      targetFindings: targetFindings,
      legacyPresent: legacyPresent,
    },
  }

  action load(projectPresent: bool, valid: bool, operationPresent: bool,
      operationEqual: bool, expectedMatches: bool,
      stage: int, findings: int): bool = all {
    s.phase == "loading",
    Set(0, 1, 2, 3, 4).contains(stage),
    Set(0, 1, 2).contains(findings),
    operationEqual implies operationPresent,
    not(projectPresent) implies (not(operationPresent) and stage == 0 and findings == 0),
    s' = {...s,
      phase: "loaded",
      projectExists: projectPresent,
      documentValid: valid,
      operationIdPresent: operationPresent,
      operationEqual: operationEqual,
      expectedMatches: expectedMatches,
      loadedStage: stage,
      loadedFindings: findings,
      stage: stage,
      findings: findings,
      candidateStage: stage,
      candidateFindings: findings,
      initialReads: 1,
      operationVisible: projectPresent and valid and operationEqual,
      effectApplications: if (projectPresent and valid and operationEqual) 1 else 0,
    },
  }

  action rejectCorrupt = all {
    s.phase == "loaded",
    s.projectExists,
    not(s.documentValid),
    s' = {...s, phase: "done", outcome: "corrupt"},
  }

  action rejectOperationCollision = all {
    s.phase == "loaded",
    s.projectExists,
    s.documentValid,
    s.operationIdPresent,
    not(s.operationEqual),
    s' = {...s, phase: "done", outcome: "operation-collision"},
  }

  action replay = all {
    s.phase == "loaded",
    s.projectExists,
    s.documentValid,
    s.operationEqual,
    s' = {...s, phase: "done", outcome: "already"},
  }

  action rejectExistingInitial = all {
    s.phase == "loaded",
    s.projectExists,
    s.documentValid,
    not(s.operationIdPresent),
    Set("create", "import").contains(s.commandKind),
    s' = {...s, phase: "done", outcome: "conflict"},
  }

  action rejectMissingMutation = all {
    s.phase == "loaded",
    not(s.projectExists),
    Set("stage", "finding").contains(s.commandKind),
    s' = {...s, phase: "done", outcome: "not-found"},
  }

  action rejectStaleMutation = all {
    s.phase == "loaded",
    s.projectExists,
    s.documentValid,
    not(s.operationIdPresent),
    Set("stage", "finding").contains(s.commandKind),
    not(s.expectedMatches),
    s' = {...s, phase: "done", outcome: "conflict"},
  }

  action prepareCreate = all {
    s.phase == "loaded",
    not(s.projectExists),
    s.commandKind == "create",
    s.targetStage == 0,
    s.targetFindings == 0,
    s' = {...s,
      phase: "prepared",
      candidateStage: 0,
      candidateFindings: 0,
    },
  }

  action prepareImport = all {
    s.phase == "loaded",
    not(s.projectExists),
    s.commandKind == "import",
    s.legacyPresent,
    s' = {...s,
      phase: "prepared",
      candidateStage: s.targetStage,
      candidateFindings: s.targetFindings,
    },
  }

  action rejectMissingLegacy = all {
    s.phase == "loaded",
    not(s.projectExists),
    s.commandKind == "import",
    not(s.legacyPresent),
    s' = {...s, phase: "done", outcome: "invalid"},
  }

  action prepareStage = all {
    s.phase == "loaded",
    s.projectExists,
    s.documentValid,
    not(s.operationIdPresent),
    s.expectedMatches,
    s.commandKind == "stage",
    s.loadedStage < 4,
    s.targetStage == s.loadedStage + 1,
    s' = {...s,
      phase: "prepared",
      candidateStage: s.targetStage,
      candidateFindings: s.loadedFindings,
    },
  }

  action rejectInvalidStage = all {
    s.phase == "loaded",
    s.projectExists,
    s.documentValid,
    not(s.operationIdPresent),
    s.expectedMatches,
    s.commandKind == "stage",
    (s.loadedStage == 4 or s.targetStage != s.loadedStage + 1),
    s' = {...s, phase: "done", outcome: "invalid"},
  }

  action prepareFinding = all {
    s.phase == "loaded",
    s.projectExists,
    s.documentValid,
    not(s.operationIdPresent),
    s.expectedMatches,
    s.commandKind == "finding",
    s.loadedFindings < 2,
    s' = {...s,
      phase: "prepared",
      candidateStage: s.loadedStage,
      candidateFindings: s.loadedFindings + 1,
    },
  }

  action rejectFindingLimit = all {
    s.phase == "loaded",
    s.projectExists,
    s.documentValid,
    not(s.operationIdPresent),
    s.expectedMatches,
    s.commandKind == "finding",
    s.loadedFindings == 2,
    s' = {...s, phase: "done", outcome: "resource-exhausted"},
  }

  action commitSuccess = all {
    s.phase == "prepared",
    s' = {...s,
      phase: "done",
      projectExists: true,
      stage: s.candidateStage,
      findings: s.candidateFindings,
      writeAttempts: 1,
      operationVisible: true,
      effectApplications: 1,
      revisionDelta: 1,
      outcome: "applied",
    },
  }

  action commitUnknown(published: bool): bool = all {
    s.phase == "prepared",
    s' = {...s,
      phase: "unknown-returned",
      projectExists: if (published) true else s.projectExists,
      stage: if (published) s.candidateStage else s.loadedStage,
      findings: if (published) s.candidateFindings else s.loadedFindings,
      writeAttempts: 1,
      operationVisible: published,
      effectApplications: if (published) 1 else 0,
      revisionDelta: if (published) 1 else 0,
      outcome: "unknown",
    },
  }

  action commitConflictSame = all {
    s.phase == "prepared",
    s' = {...s,
      phase: "reconcile-same",
      projectExists: true,
      stage: s.candidateStage,
      findings: s.candidateFindings,
      writeAttempts: 1,
      externalKind: "same",
      operationVisible: true,
      effectApplications: 1,
      revisionDelta: 1,
    },
  }

  action commitConflictDifferent = all {
    s.phase == "prepared",
    s' = {...s,
      phase: "reconcile-different",
      writeAttempts: 1,
      externalKind: "different",
      operationVisible: false,
      effectApplications: 0,
      revisionDelta: 1,
    },
  }

  action reconcileSame = all {
    s.phase == "reconcile-same",
    s' = {...s,
      phase: "done",
      conflictReads: 1,
      outcome: "already",
    },
  }

  action reconcileDifferent = all {
    s.phase == "reconcile-different",
    s' = {...s,
      phase: "done",
      conflictReads: 1,
      outcome: "conflict",
    },
  }

  action reconcileUnknownApplied = all {
    s.phase == "unknown-returned",
    s.operationVisible,
    s' = {...s,
      phase: "done",
      unknownReads: 1,
      outcome: "reconciled-applied",
    },
  }

  action reconcileUnknownNotObserved = all {
    s.phase == "unknown-returned",
    not(s.operationVisible),
    s' = {...s,
      phase: "done",
      unknownReads: 1,
      outcome: "reconciled-not-observed",
    },
  }

  action finishUnknownWithoutReconcile = all {
    s.phase == "unknown-returned",
    s' = {...s, phase: "done"},
  }

  action step = any {
    {
      nondet kind = Set("create", "import", "stage", "finding").oneOf()
      nondet targetStage = Set(0, 1, 2, 3, 4).oneOf()
      nondet targetFindings = Set(0, 1, 2).oneOf()
      nondet legacyPresent = Set(false, true).oneOf()
      begin(kind, targetStage, targetFindings, legacyPresent)
    },
    {
      nondet projectPresent = Set(false, true).oneOf()
      nondet valid = Set(false, true).oneOf()
      nondet operationPresent = Set(false, true).oneOf()
      nondet operationEqual = Set(false, true).oneOf()
      nondet expectedMatches = Set(false, true).oneOf()
      nondet stage = Set(0, 1, 2, 3, 4).oneOf()
      nondet findings = Set(0, 1, 2).oneOf()
      load(projectPresent, valid, operationPresent, operationEqual,
        expectedMatches, stage, findings)
    },
    rejectCorrupt,
    rejectOperationCollision,
    replay,
    rejectExistingInitial,
    rejectMissingMutation,
    rejectStaleMutation,
    prepareCreate,
    prepareImport,
    rejectMissingLegacy,
    prepareStage,
    rejectInvalidStage,
    prepareFinding,
    rejectFindingLimit,
    commitSuccess,
    {
      nondet published = Set(false, true).oneOf()
      commitUnknown(published)
    },
    commitConflictSame,
    commitConflictDifferent,
    reconcileSame,
    reconcileDifferent,
    reconcileUnknownApplied,
    reconcileUnknownNotObserved,
    finishUnknownWithoutReconcile,
    all { s.phase == "done", s' = s },
  }

  val boundedState =
    Set(0, 1, 2, 3, 4).contains(s.stage) and
    Set(0, 1, 2, 3, 4).contains(s.loadedStage) and
    Set(0, 1, 2, 3, 4).contains(s.candidateStage) and
    Set(0, 1, 2).contains(s.findings) and
    Set(0, 1, 2).contains(s.loadedFindings) and
    Set(0, 1, 2).contains(s.candidateFindings) and
    Set(0, 1).contains(s.initialReads) and
    Set(0, 1).contains(s.writeAttempts) and
    Set(0, 1).contains(s.conflictReads) and
    Set(0, 1).contains(s.unknownReads) and
    Set(0, 1).contains(s.effectApplications) and
    Set(0, 1).contains(s.revisionDelta)

  val operationAndEffectAreAtomic =
    s.operationVisible == (s.effectApplications == 1)

  val operationAppliedAtMostOnce = s.effectApplications <= 1

  val noAutomaticRetry =
    s.writeAttempts <= 1 and s.conflictReads <= 1 and s.unknownReads <= 1

  val replayWritesNothing =
    (s.outcome == "already" and s.externalKind == "none") implies
      (s.operationEqual and s.operationVisible and
        s.writeAttempts == 0 and s.conflictReads == 0 and
        s.revisionDelta == 0)

  val collisionWritesNothing =
    (s.outcome == "operation-collision") implies
      (s.operationIdPresent and not(s.operationEqual) and
        s.writeAttempts == 0 and not(s.operationVisible))

  val staleOrExistingConflictWritesNothing =
    (s.outcome == "conflict" and s.externalKind == "none") implies
      (s.writeAttempts == 0 and s.revisionDelta == 0)

  val sameOperationRaceConverges =
    (s.outcome == "already" and s.externalKind == "same") implies
      (s.writeAttempts == 1 and s.conflictReads == 1 and
        s.operationVisible and s.effectApplications == 1 and
        s.revisionDelta == 1)

  val differentOperationRaceDoesNotMerge =
    (s.externalKind == "different") implies
      (not(s.operationVisible) and s.effectApplications == 0 and
        s.outcome != "applied" and s.outcome != "already")

  val stageEffectIsOneForwardStep =
    (s.commandKind == "stage" and not(s.operationEqual) and
      s.operationVisible) implies
      (s.loadedStage < 4 and s.stage == s.loadedStage + 1 and
        s.findings == s.loadedFindings)

  val findingEffectIsOneAppend =
    (s.commandKind == "finding" and not(s.operationEqual) and
      s.operationVisible) implies
      (s.stage == s.loadedStage and s.findings == s.loadedFindings + 1)

  val createStartsEmpty =
    (s.commandKind == "create" and not(s.operationEqual) and
      s.operationVisible) implies
      (not(s.loadedStage > 0) and s.stage == 0 and s.findings == 0)

  val importPreservesSnapshotAndLegacy =
    (s.commandKind == "import" and not(s.operationEqual) and
      s.operationVisible) implies
      (s.legacyPresent and s.stage == s.targetStage and
        s.findings == s.targetFindings)

  val legacySourceIsNeverRemoved = s.legacyPresent implies s.legacyPresent

  val journalLinkNeverChanges = s.journalStable

  val appliedOutcomeIsVisible =
    (s.outcome == "applied") implies
      (s.writeAttempts == 1 and s.operationVisible and
        s.effectApplications == 1 and s.revisionDelta == 1)

  val unknownIsNotReportedAsApplied =
    (s.outcome == "unknown") implies
      (s.writeAttempts == 1 and s.conflictReads == 0 and
        s.outcome != "applied" and s.outcome != "already")

  val unknownReconciliationIsReadOnly =
    (s.unknownReads == 1) implies
      (s.writeAttempts == 1 and s.conflictReads == 0 and
        Set("reconciled-applied", "reconciled-not-observed").contains(s.outcome))

  val reconciledAppliedRequiresObservation =
    (s.outcome == "reconciled-applied") implies
      (s.operationVisible and s.effectApplications == 1)

  val reconciledNotObservedRequiresAbsence =
    (s.outcome == "reconciled-not-observed") implies
      (not(s.operationVisible) and s.effectApplications == 0)

  val invariant =
    boundedState and operationAndEffectAreAtomic and operationAppliedAtMostOnce and
    noAutomaticRetry and replayWritesNothing and collisionWritesNothing and
    staleOrExistingConflictWritesNothing and sameOperationRaceConverges and
    differentOperationRaceDoesNotMerge and stageEffectIsOneForwardStep and
    findingEffectIsOneAppend and createStartsEmpty and
    importPreservesSnapshotAndLegacy and legacySourceIsNeverRemoved and
    journalLinkNeverChanges and appliedOutcomeIsVisible and
    unknownIsNotReportedAsApplied and unknownReconciliationIsReadOnly and
    reconciledAppliedRequiresObservation and reconciledNotObservedRequiresAbsence
}
