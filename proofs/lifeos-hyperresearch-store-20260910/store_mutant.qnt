// Author: Naray Puthillathu
// Deliberately unsafe: writer B overwrites writer A's immutable revision and a
// read may expose staged content. The shared invariant must reject this model.
module store_mutant {
  type State = {
    stagedA: bool, stagedB: bool, publishedOwner: str, durableRevision: int,
    headRevision: int, resultA: str, resultB: str, crashedA: bool,
    crashedB: bool, corrupt: bool, readAttempted: bool, readSucceeded: bool,
    readRevision: int, exposedStaged: bool,
  }
  var s: State
  action init = s' = {
    stagedA: false, stagedB: false, publishedOwner: "none", durableRevision: 0,
    headRevision: 0, resultA: "pending", resultB: "pending", crashedA: false,
    crashedB: false, corrupt: false, readAttempted: false, readSucceeded: false,
    readRevision: 0, exposedStaged: false,
  }
  action unsafeCommitA = all {
    s.durableRevision == 0,
    s' = {...s, publishedOwner: "a", durableRevision: 1, resultA: "committed"},
  }
  action unsafeOverwriteB = all {
    s.durableRevision == 1, s.publishedOwner == "a",
    s' = {...s, publishedOwner: "b", resultB: "committed"},
  }
  action unsafeReadStaged = all {
    not(s.readAttempted),
    s' = {...s, readAttempted: true, readSucceeded: true,
      readRevision: 1, exposedStaged: true},
  }
  action step = any { unsafeCommitA, unsafeOverwriteB, unsafeReadStaged }

  val validOwner = Set("none", "a", "b").contains(s.publishedOwner)
  val immutableIdentity =
    (s.durableRevision == 0 and s.publishedOwner == "none") or
    (s.durableRevision == 1 and Set("a", "b").contains(s.publishedOwner))
  val advisoryHeadNeverAhead = s.headRevision <= s.durableRevision
  val oneWriterOwnsRevision =
    not((Set("published", "committed", "unknown").contains(s.resultA)) and
        (Set("published", "committed", "unknown").contains(s.resultB)))
  val receiptAIdentifiesOwner = s.resultA == "committed" implies s.publishedOwner == "a"
  val receiptBIdentifiesOwner = s.resultB == "committed" implies s.publishedOwner == "b"
  val conflictAIsNotOwner = s.resultA == "conflict" implies s.publishedOwner != "a"
  val conflictBIsNotOwner = s.resultB == "conflict" implies s.publishedOwner != "b"
  val readsOnlyDurable = s.readSucceeded implies s.readRevision == s.durableRevision
  val corruptReadFails = (s.readAttempted and s.corrupt) implies not(s.readSucceeded)
  val stagingNeverVisible = not(s.exposedStaged)
  val invariant = validOwner and immutableIdentity and advisoryHeadNeverAhead and
    oneWriterOwnsRevision and receiptAIdentifiesOwner and receiptBIdentifiesOwner and
    conflictAIsNotOwner and conflictBIsNotOwner and readsOnlyDurable and
    corruptReadFails and stagingNeverVisible
}
