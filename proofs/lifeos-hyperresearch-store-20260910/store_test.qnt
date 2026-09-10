// Author: Naray Puthillathu
module store_test {
  import store.* from "./store"

  run emptyReadTest = init.then(read)
    .expect(s.readSucceeded and s.readRevision == 0)

  run stagingInvisibleTest = init.then(stageA).then(read)
    .expect(s.readSucceeded and s.readRevision == 0 and not(s.exposedStaged))

  run writerACommitTest = init.then(stageA).then(publishA).then(confirmA)
    .expect(s.resultA == "committed" and s.publishedOwner == "a")

  run writerBCommitTest = init.then(stageB).then(publishB).then(confirmB)
    .expect(s.resultB == "committed" and s.publishedOwner == "b")

  run competingWriterConflictTest = init.then(stageA).then(stageB)
    .then(publishA).then(confirmA).then(conflictB)
    .expect(s.resultA == "committed" and s.resultB == "conflict")

  run crashBeforePublicationTest = init.then(stageA).then(crashA).then(read)
    .expect(s.durableRevision == 0 and s.readRevision == 0)

  run crashAfterPublicationTest = init.then(stageA).then(publishA).then(crashA).then(read)
    .expect(s.resultA == "unknown" and s.readSucceeded and s.readRevision == 1)

  run missingHeadDoesNotHideRevisionTest = init.then(stageA).then(publishA).then(confirmA).then(read)
    .expect(s.headRevision == 0 and s.readRevision == 1)

  run headRecoveryTest = init.then(stageA).then(publishA).then(confirmA)
    .then(refreshHead).then(read)
    .expect(s.headRevision == 1 and s.readRevision == 1)

  run corruptRevisionRefusalTest = init.then(stageA).then(publishA).then(confirmA)
    .then(tamper).then(read)
    .expect(not(s.readSucceeded) and s.readRevision == 0)
}
