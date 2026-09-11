// Author: Naray Puthillathu
module durable_cutover_test {
  import durable_cutover.* from "./durable_cutover"

  run activationSuccess = init
    .then(configure(true, true, true, true, true))
    .then(activate)
    .expect(s.activated and s.phase == "active")

  run invalidManifestRejects = init
    .then(configure(false, true, true, true, true))
    .then(rejectActivation)
    .expect(not(s.activated) and s.writeAttempts == 0)

  run approvalMismatchRejects = init
    .then(configure(true, false, true, true, true))
    .then(rejectActivation)
    .expect(not(s.activated) and not(s.fallbackUsed))

  run unavailableStoreNeverFallsBack = init
    .then(configure(true, true, false, true, true))
    .then(rejectActivation)
    .expect(s.legacyCalls == 0 and not(s.fallbackUsed))

  run projectRevisionMismatchRejectsActivation = init
    .then(configure(true, true, true, false, true))
    .then(rejectActivation)
    .expect(not(s.activated) and s.projectWrites == 0)

  run journalRevisionMismatchRejectsActivation = init
    .then(configure(true, true, true, true, false))
    .then(rejectActivation)
    .expect(not(s.activated) and s.journalWrites == 0)

  run unauthorizedOperationWritesNothing = init
    .then(configure(true, true, true, true, true))
    .then(activate)
    .then(chooseOperation("project", false, true, true))
    .then(rejectOperation)
    .expect(not(s.success) and s.writeAttempts == 0)

  run staleJournalCursorWritesNothing = init
    .then(configure(true, true, true, true, true))
    .then(activate)
    .then(chooseOperation("evidence", true, true, false))
    .then(rejectOperation)
    .expect(s.journalWrites == 0 and not(s.success))

  run projectMutationReportsConcurrentJournalChange = init
    .then(configure(true, true, true, true, true))
    .then(activate)
    .then(chooseOperation("project", true, true, true))
    .then(projectSuccess(true))
    .expect(s.projectWrites == 1 and s.otherChanged and s.truthfulReceipt)

  run evidenceMutationSucceedsWithOneWrite = init
    .then(configure(true, true, true, true, true))
    .then(activate)
    .then(chooseOperation("evidence", true, true, true))
    .then(evidenceSuccess(false))
    .expect(s.journalWrites == 1 and s.projectWrites == 0 and s.success)

  run conflictIsExplicitAndNotRetried = init
    .then(configure(true, true, true, true, true))
    .then(activate)
    .then(chooseOperation("project", true, true, true))
    .then(projectConflict)
    .expect(s.conflict and not(s.success) and s.writeAttempts == 1 and s.retries == 0)

  run unknownCommitIsNeverSuccess = init
    .then(configure(true, true, true, true, true))
    .then(activate)
    .then(chooseOperation("evidence", true, true, true))
    .then(evidenceUnknown)
    .expect(s.unknown and not(s.success) and s.retries == 0)

  run deactivationIsNonDestructive = init
    .then(configure(true, true, true, true, true))
    .then(activate)
    .then(deactivate)
    .expect(s.deactivated and s.writeAttempts == 0 and not(s.sourceDeleted))
}
