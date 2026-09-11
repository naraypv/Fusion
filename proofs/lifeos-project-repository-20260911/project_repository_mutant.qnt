// Author: Naray Puthillathu
// Deliberately unsafe implementation: a retry of one finding operation appends
// the same logical effect twice because the operation ledger is ignored.
module project_repository_mutant {
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
    phase: "prepared",
    commandKind: "finding",
    legacyPresent: false,
    projectExists: true,
    documentValid: true,
    operationIdPresent: false,
    operationEqual: false,
    expectedMatches: true,
    loadedStage: 2,
    loadedFindings: 0,
    targetStage: 0,
    targetFindings: 0,
    stage: 2,
    findings: 0,
    candidateStage: 2,
    candidateFindings: 1,
    initialReads: 1,
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

  action publishOnce = all {
    s.phase == "prepared",
    s' = {...s,
      phase: "retry",
      findings: 1,
      writeAttempts: 1,
      operationVisible: true,
      effectApplications: 1,
      revisionDelta: 1,
    },
  }

  action duplicateOnRetry = all {
    s.phase == "retry",
    s' = {...s,
      phase: "done",
      findings: 2,
      writeAttempts: 2,
      operationVisible: true,
      effectApplications: 2,
      revisionDelta: 2,
      outcome: "applied",
    },
  }

  action step = any {
    publishOnce,
    duplicateOnRetry,
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
