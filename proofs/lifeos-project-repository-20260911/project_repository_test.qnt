// Author: Naray Puthillathu
module project_repository_test {
  import project_repository.* from "./project_repository"

  run createSuccessTest = init
    .then(begin("create", 0, 0, false))
    .then(load(false, true, false, false, true, 0, 0))
    .then(prepareCreate)
    .then(commitSuccess)
    .expect(s.outcome == "applied" and s.projectExists and s.stage == 0 and s.findings == 0)

  run existingCreateConflictTest = init
    .then(begin("create", 0, 0, false))
    .then(load(true, true, false, false, false, 0, 0))
    .then(rejectExistingInitial)
    .expect(s.outcome == "conflict" and s.writeAttempts == 0)

  run legacyImportSuccessTest = init
    .then(begin("import", 3, 2, true))
    .then(load(false, true, false, false, true, 0, 0))
    .then(prepareImport)
    .then(commitSuccess)
    .expect(s.outcome == "applied" and s.legacyPresent and s.stage == 3 and s.findings == 2)

  run importRequiresLegacySnapshotTest = init
    .then(begin("import", 2, 1, false))
    .then(load(false, true, false, false, true, 0, 0))
    .then(rejectMissingLegacy)
    .expect(s.outcome == "invalid" and not(s.projectExists) and s.writeAttempts == 0)

  run identicalOperationReplayTest = init
    .then(begin("finding", 0, 0, false))
    .then(load(true, true, true, true, false, 2, 1))
    .then(replay)
    .expect(s.outcome == "already" and s.operationVisible and s.writeAttempts == 0)

  run operationCollisionTest = init
    .then(begin("finding", 0, 0, false))
    .then(load(true, true, true, false, true, 2, 1))
    .then(rejectOperationCollision)
    .expect(s.outcome == "operation-collision" and not(s.operationVisible))

  run staleStageCommandTest = init
    .then(begin("stage", 2, 0, false))
    .then(load(true, true, false, false, false, 1, 0))
    .then(rejectStaleMutation)
    .expect(s.outcome == "conflict" and s.stage == 1 and s.writeAttempts == 0)

  run stageAdvanceSuccessTest = init
    .then(begin("stage", 2, 0, false))
    .then(load(true, true, false, false, true, 1, 0))
    .then(prepareStage)
    .then(commitSuccess)
    .expect(s.outcome == "applied" and s.stage == 2 and s.findings == 0)

  run stageSkipRejectedTest = init
    .then(begin("stage", 3, 0, false))
    .then(load(true, true, false, false, true, 1, 0))
    .then(rejectInvalidStage)
    .expect(s.outcome == "invalid" and s.stage == 1 and s.writeAttempts == 0)

  run findingAppendSuccessTest = init
    .then(begin("finding", 0, 0, false))
    .then(load(true, true, false, false, true, 2, 0))
    .then(prepareFinding)
    .then(commitSuccess)
    .expect(s.outcome == "applied" and s.stage == 2 and s.findings == 1)

  run sameOperationRaceTest = init
    .then(begin("finding", 0, 0, false))
    .then(load(true, true, false, false, true, 2, 0))
    .then(prepareFinding)
    .then(commitConflictSame)
    .then(reconcileSame)
    .expect(s.outcome == "already" and s.findings == 1 and s.conflictReads == 1)

  run differentOperationRaceTest = init
    .then(begin("finding", 0, 0, false))
    .then(load(true, true, false, false, true, 2, 0))
    .then(prepareFinding)
    .then(commitConflictDifferent)
    .then(reconcileDifferent)
    .expect(s.outcome == "conflict" and s.findings == 0 and not(s.operationVisible))

  run unknownPublishedReconciliationTest = init
    .then(begin("finding", 0, 0, false))
    .then(load(true, true, false, false, true, 2, 0))
    .then(prepareFinding)
    .then(commitUnknown(true))
    .then(reconcileUnknownApplied)
    .expect(s.outcome == "reconciled-applied" and s.findings == 1 and s.unknownReads == 1)

  run unknownUnpublishedReconciliationTest = init
    .then(begin("stage", 2, 0, false))
    .then(load(true, true, false, false, true, 1, 0))
    .then(prepareStage)
    .then(commitUnknown(false))
    .then(reconcileUnknownNotObserved)
    .expect(s.outcome == "reconciled-not-observed" and s.stage == 1 and s.unknownReads == 1)
}
