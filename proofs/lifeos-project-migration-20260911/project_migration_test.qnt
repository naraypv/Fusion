// Author: Naray Puthillathu
module project_migration_test {
  import project_migration.* from "./project_migration"

  run migrateAbsentTest = init
    .then(beginMigration("source-a", "absent"))
    .then(migrationPrepare)
    .then(migrationCommit)
    .expect(s.outcome == "migrated" and s.durableOrigin == "source-a" and s.legacyIntact)

  run alreadyMigratedTest = init
    .then(beginMigration("source-a", "same"))
    .then(migrationAlready)
    .expect(s.outcome == "already" and s.writeAttempts == 0 and s.legacyIntact)

  run changedSourceConflictTest = init
    .then(beginMigration("source-a", "other"))
    .then(migrationExistingConflict)
    .expect(s.outcome == "migration-conflict" and s.durableOrigin == "other")

  run nativeDestinationConflictTest = init
    .then(beginMigration("source-a", "native"))
    .then(migrationExistingConflict)
    .expect(s.outcome == "migration-conflict" and s.writeAttempts == 0)

  run unknownBeforePublicationTest = init
    .then(beginMigration("source-a", "absent"))
    .then(migrationPrepare)
    .then(migrationUnknown(false))
    .expect(s.outcome == "unknown" and s.durableOrigin == "none" and s.legacyIntact)

  run unknownAfterPublicationTest = init
    .then(beginMigration("source-a", "absent"))
    .then(migrationPrepare)
    .then(migrationUnknown(true))
    .expect(s.outcome == "unknown" and s.durableOrigin == "source-a" and s.legacyIntact)

  run concurrentSameMigrationTest = init
    .then(beginMigration("source-a", "absent"))
    .then(migrationPrepare)
    .then(migrationRaceSame)
    .then(reconcileSame)
    .expect(s.outcome == "already" and s.reconcileReads == 1 and s.ownRevisionWrites == 0)

  run concurrentDifferentMigrationTest = init
    .then(beginMigration("source-a", "absent"))
    .then(migrationPrepare)
    .then(migrationRaceDifferent)
    .then(reconcileDifferent)
    .expect(s.outcome == "migration-conflict" and s.durableOrigin == "other")

  run invalidMutationTest = init
    .then(beginMutation("finding", true, false, 1, 0))
    .then(rejectInvalidMutation)
    .expect(s.outcome == "invalid" and s.writeAttempts == 0 and s.findingsAfter == 0)

  run staleMutationTest = init
    .then(beginMutation("advance", false, true, 1, 0))
    .then(rejectStaleMutation)
    .expect(s.outcome == "conflict" and s.stageAfter == 1 and s.writeAttempts == 0)

  run advanceStageTest = init
    .then(beginMutation("advance", true, true, 2, 1))
    .then(commitAdvance)
    .expect(s.outcome == "updated" and s.stageAfter == 3 and s.findingsAfter == 1)

  run appendFindingTest = init
    .then(beginMutation("finding", true, true, 2, 1))
    .then(commitFinding)
    .expect(s.outcome == "updated" and s.findingsAfter == 2 and s.stageAfter == 2)

  run mutationUnknownTest = init
    .then(beginMutation("finding", true, true, 2, 1))
    .then(mutationUnknown(true))
    .expect(s.outcome == "unknown" and s.findingsAfter == 2 and s.ownRevisionWrites == 1)
}
