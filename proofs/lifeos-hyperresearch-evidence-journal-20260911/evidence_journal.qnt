// Author: Naray Puthillathu
// Finite abstraction of one durable evidence-journal append.
module evidence_journal {
  type State = {
    phase: str,
    incomingItems: int,
    initiallyPresent: bool,
    expectedMatches: bool,
    winnerSameBatch: bool,
    initialRevision: int,
    revision: int,
    stagedItems: int,
    incomingVisibleItems: int,
    conflictObserved: bool,
    reconciliationReads: int,
    outcome: str,
  }
  var s: State
  action init = s' = {
    phase: "new", incomingItems: 0, initiallyPresent: false,
    expectedMatches: true, winnerSameBatch: false, initialRevision: 0,
    revision: 0, stagedItems: 0, incomingVisibleItems: 0,
    conflictObserved: false, reconciliationReads: 0, outcome: "pending",
  }
  action prepare(items: int, present: bool, expected: bool, sameWinner: bool): bool = all {
    s.phase == "new", Set(0, 1, 2).contains(items),
    items == 0 implies not(present), present implies expected,
    s' = {...s, phase: "prepared", incomingItems: items,
      initiallyPresent: present, expectedMatches: expected,
      winnerSameBatch: sameWinner, initialRevision: if (present) 1 else 0,
      revision: if (present) 1 else 0,
      incomingVisibleItems: if (present) items else 0},
  }
  action finishEmpty = all {
    s.phase == "prepared", s.incomingItems == 0,
    s' = {...s, phase: "done", outcome: "empty"},
  }
  action finishReplay = all {
    s.phase == "prepared", s.incomingItems > 0, s.initiallyPresent,
    s' = {...s, phase: "done", outcome: "already_present"},
  }
  action stage = all {
    s.phase == "prepared", s.incomingItems > 0, not(s.initiallyPresent),
    s.expectedMatches,
    s' = {...s, phase: "staged", stagedItems: s.incomingItems},
  }
  action failBeforePublication = all {
    s.phase == "staged",
    s' = {...s, phase: "done", stagedItems: 0, outcome: "failed"},
  }
  action publish = all {
    s.phase == "staged",
    s' = {...s, phase: "published", revision: s.initialRevision + 1,
      stagedItems: 0, incomingVisibleItems: s.incomingItems},
  }
  action confirmPublication = all {
    s.phase == "published",
    s' = {...s, phase: "done", outcome: "appended"},
  }
  action loseConfirmation = all {
    s.phase == "published",
    s' = {...s, phase: "done", outcome: "commit_state_unknown"},
  }
  action observeConflict = all {
    s.phase == "prepared", s.incomingItems > 0, not(s.initiallyPresent),
    not(s.expectedMatches),
    s' = {...s, phase: "conflict", revision: s.initialRevision + 1,
      conflictObserved: true,
      incomingVisibleItems: if (s.winnerSameBatch) s.incomingItems else 0},
  }
  action reconcileOnce = all {
    s.phase == "conflict", s.reconciliationReads == 0,
    s' = {...s, phase: "done", reconciliationReads: 1,
      outcome: if (s.winnerSameBatch) "already_present" else "conflict"},
  }
  action step = any {
    { nondet items = Set(0, 1, 2).oneOf()
      nondet present = Set(false, true).oneOf()
      nondet expected = Set(false, true).oneOf()
      nondet sameWinner = Set(false, true).oneOf()
      prepare(items, present, expected, sameWinner) },
    finishEmpty, finishReplay, stage, failBeforePublication, publish,
    confirmPublication, loseConfirmation, observeConflict, reconcileOnce,
    all { s.phase == "done", s' = s },
  }
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
