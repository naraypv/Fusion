// Author: Naray Puthillathu
module evidence_journal_test {
  import evidence_journal.* from "./evidence_journal"

  run emptyNoopTest = init
    .then(begin(0))
    .then(emptyNoop)
    .expect(s.outcome == "empty" and s.initialReads == 0 and s.writeAttempts == 0)

  run corruptLoadTest = init
    .then(begin(1))
    .then(load(false, false, false))
    .then(rejectCorrupt)
    .expect(s.outcome == "corrupt" and s.writeAttempts == 0)

  run collisionRefusalTest = init
    .then(begin(1))
    .then(load(true, true, false))
    .then(rejectCollision)
    .expect(s.outcome == "corrupt" and not(s.batchVisible))

  run initialReplayTest = init
    .then(begin(1))
    .then(load(true, true, true))
    .then(replay)
    .expect(s.outcome == "already" and s.batchVisible and s.writeAttempts == 0)

  run oneItemAppendTest = init
    .then(begin(1))
    .then(load(true, false, false))
    .then(prepare)
    .then(commitSuccess)
    .expect(s.outcome == "appended" and s.visibleItems == 1 and s.revisionDelta == 1)

  run twoItemAppendTest = init
    .then(begin(2))
    .then(load(true, false, false))
    .then(prepare)
    .then(commitSuccess)
    .expect(s.outcome == "appended" and s.visibleItems == 2 and s.writeAttempts == 1)

  run unknownBeforePublicationTest = init
    .then(begin(2))
    .then(load(true, false, false))
    .then(prepare)
    .then(commitUnknown(false))
    .expect(s.outcome == "unknown" and s.visibleItems == 0 and s.revisionDelta == 0)

  run unknownAfterPublicationTest = init
    .then(begin(2))
    .then(load(true, false, false))
    .then(prepare)
    .then(commitUnknown(true))
    .expect(s.outcome == "unknown" and s.visibleItems == 2 and s.revisionDelta == 1)

  run sameBatchRaceTest = init
    .then(begin(2))
    .then(load(true, false, false))
    .then(prepare)
    .then(commitConflictSame)
    .then(reconcileSame)
    .expect(s.outcome == "already" and s.reconcileReads == 1 and s.visibleItems == 2)

  run differentBatchRaceTest = init
    .then(begin(2))
    .then(load(true, false, false))
    .then(prepare)
    .then(commitConflictDifferent)
    .then(reconcileDifferent)
    .expect(s.outcome == "conflict" and s.reconcileReads == 1 and s.visibleItems == 0)
}
