// Author: Naray Puthillathu
module evidence_journal_mutant {
  type State = {
    phase: str, incomingItems: int, initiallyPresent: bool,
    expectedMatches: bool, winnerSameBatch: bool, initialRevision: int,
    revision: int, stagedItems: int, incomingVisibleItems: int,
    conflictObserved: bool, reconciliationReads: int, outcome: str,
  }
  var s: State
  action init = s' = {
    phase: "new", incomingItems: 0, initiallyPresent: false,
    expectedMatches: true, winnerSameBatch: false, initialRevision: 0,
    revision: 0, stagedItems: 0, incomingVisibleItems: 0,
    conflictObserved: false, reconciliationReads: 0, outcome: "pending",
  }
  action prepare = all {
    s.phase == "new",
    s' = {...s, phase: "staged", incomingItems: 2, stagedItems: 2},
  }
  action exposeFirstItem = all {
    s.phase == "staged",
    s' = {...s, phase: "done", stagedItems: 1,
      incomingVisibleItems: 1, outcome: "failed"},
  }
  action step = any { prepare, exposeFirstItem, all { s.phase == "done", s' = s } }
  val wholeBatchVisibility =
    s.incomingVisibleItems == 0 or s.incomingVisibleItems == s.incomingItems
  val stagedStateIsInvisible = s.phase == "staged" implies s.incomingVisibleItems == 0
  val revisionAdvancesAtMostOnce =
    s.revision >= s.initialRevision and s.revision <= s.initialRevision + 1
  val atMostOneReconciliationRead = s.reconciliationReads <= 1
  val reconciliationRequiresConflict = s.reconciliationReads > 0 implies s.conflictObserved
  val emptyIsMutationFree = s.outcome == "empty" implies
    (s.incomingItems == 0 and s.revision == s.initialRevision and
     s.incomingVisibleItems == 0 and s.reconciliationReads == 0)
  val failedBeforePublishIsMutationFree = s.outcome == "failed" implies
    (s.revision == s.initialRevision and s.incomingVisibleItems == 0)
  val appendedIsComplete = s.outcome == "appended" implies
    (s.incomingItems > 0 and not(s.initiallyPresent) and s.expectedMatches and
     s.revision == s.initialRevision + 1 and
     s.incomingVisibleItems == s.incomingItems)
  val unknownMeansPublicationMayExist = s.outcome == "commit_state_unknown" implies
    (s.revision == s.initialRevision + 1 and s.incomingVisibleItems == s.incomingItems)
  val differentConflictDoesNotPublishIncoming = s.outcome == "conflict" implies
    (s.conflictObserved and not(s.winnerSameBatch) and
     s.incomingVisibleItems == 0 and s.reconciliationReads == 1)
  val alreadyPresentIsComplete = s.outcome == "already_present" implies
    (s.incomingItems > 0 and s.incomingVisibleItems == s.incomingItems)
  val invariant = wholeBatchVisibility and stagedStateIsInvisible and
    revisionAdvancesAtMostOnce and atMostOneReconciliationRead and
    reconciliationRequiresConflict and emptyIsMutationFree and
    failedBeforePublishIsMutationFree and appendedIsComplete and
    unknownMeansPublicationMayExist and differentConflictDoesNotPublishIncoming and
    alreadyPresentIsComplete
}
