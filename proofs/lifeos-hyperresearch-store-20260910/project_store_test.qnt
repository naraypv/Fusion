// Author: Naray Puthillathu
module project_store_test {
  import project_store.* from "./project_store"

  run createAndAcknowledge = init
    .then(stageA(0))
    .then(publishA)
    .then(acknowledgeA)
    .then(readLatest)
    .expect(s.current == 1 and s.readOwner == 1 and s.writerA.phase == "acknowledged")

  run concurrentCreateConflict = init
    .then(stageA(0))
    .then(stageB(0))
    .then(publishA)
    .then(conflictB)
    .expect(s.slot1Owner == 1 and s.writerB.phase == "conflict")

  run alternateConcurrentWinner = init
    .then(stageA(0))
    .then(stageB(0))
    .then(publishB)
    .then(conflictA)
    .expect(s.slot1Owner == 2 and s.writerA.phase == "conflict")

  run crashBeforePublication = init
    .then(stageA(0))
    .then(crashBeforeA)
    .then(readLatest)
    .expect(s.current == 0 and s.readRevision == 0 and s.readOwner == 0)

  run crashAfterPublication = init
    .then(stageA(0))
    .then(publishA)
    .then(crashAfterA)
    .then(readLatest)
    .expect(s.current == 1 and s.readOwner == 1 and s.writerA.phase == "unknown")

  run missingHeadDoesNotHideCommit = init
    .then(stageA(0))
    .then(publishA)
    .then(loseHead)
    .then(readLatest)
    .expect(s.head == 0 and s.readRevision == 1 and s.readOwner == 1)

  run corruptHeadDoesNotInventCommit = init
    .then(corruptHead)
    .then(readLatest)
    .expect(s.headCorrupt and s.head == 2 and s.readRevision == 0)

  run staleHeadDoesNotHideSecondRevision = init
    .then(stageA(0))
    .then(publishA)
    .then(refreshHead)
    .then(stageB(1))
    .then(publishB)
    .then(readLatest)
    .expect(s.current == 2 and s.head == 1 and s.readRevision == 2 and s.readOwner == 2)

  run refreshedHeadTracksLatest = init
    .then(stageA(0))
    .then(publishA)
    .then(refreshHead)
    .then(readLatest)
    .expect(s.head == 1 and s.readRevision == 1)

  run staleExpectedRevisionConflicts = init
    .then(stageA(0))
    .then(publishA)
    .then(stageB(0))
    .then(conflictB)
    .expect(s.current == 1 and s.writerB.phase == "conflict")
}
