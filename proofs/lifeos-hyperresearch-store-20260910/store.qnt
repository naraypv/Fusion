// Author: Naray Puthillathu
// Finite model of one immutable revision contested by two local writers.
module store {
  type State = {
    stagedA: bool,
    stagedB: bool,
    publishedOwner: str,
    durableRevision: int,
    headRevision: int,
    resultA: str,
    resultB: str,
    crashedA: bool,
    crashedB: bool,
    corrupt: bool,
    readAttempted: bool,
    readSucceeded: bool,
    readRevision: int,
    exposedStaged: bool,
  }

  var s: State

  action init = s' = {
    stagedA: false,
    stagedB: false,
    publishedOwner: "none",
    durableRevision: 0,
    headRevision: 0,
    resultA: "pending",
    resultB: "pending",
    crashedA: false,
    crashedB: false,
    corrupt: false,
    readAttempted: false,
    readSucceeded: false,
    readRevision: 0,
    exposedStaged: false,
  }

  action stageA = all {
    not(s.stagedA), s.resultA == "pending", not(s.crashedA),
    s' = {...s, stagedA: true},
  }
  action stageB = all {
    not(s.stagedB), s.resultB == "pending", not(s.crashedB),
    s' = {...s, stagedB: true},
  }

  action publishA = all {
    s.stagedA, s.publishedOwner == "none", s.durableRevision == 0,
    s' = {...s, stagedA: false, publishedOwner: "a", durableRevision: 1,
      resultA: "published"},
  }
  action publishB = all {
    s.stagedB, s.publishedOwner == "none", s.durableRevision == 0,
    s' = {...s, stagedB: false, publishedOwner: "b", durableRevision: 1,
      resultB: "published"},
  }

  action confirmA = all {
    s.resultA == "published", s.publishedOwner == "a",
    s' = {...s, resultA: "committed"},
  }
  action confirmB = all {
    s.resultB == "published", s.publishedOwner == "b",
    s' = {...s, resultB: "committed"},
  }

  action conflictA = all {
    s.stagedA, s.durableRevision == 1, s.publishedOwner != "a",
    s' = {...s, stagedA: false, resultA: "conflict"},
  }
  action conflictB = all {
    s.stagedB, s.durableRevision == 1, s.publishedOwner != "b",
    s' = {...s, stagedB: false, resultB: "conflict"},
  }

  action crashA = all {
    not(s.crashedA),
    s' = {...s, stagedA: false, crashedA: true,
      resultA: if (s.resultA == "published") "unknown" else s.resultA},
  }
  action crashB = all {
    not(s.crashedB),
    s' = {...s, stagedB: false, crashedB: true,
      resultB: if (s.resultB == "published") "unknown" else s.resultB},
  }

  action refreshHead = all {
    not(s.corrupt), s.headRevision != s.durableRevision,
    s' = {...s, headRevision: s.durableRevision},
  }

  action tamper = all {
    not(s.corrupt), s.durableRevision == 1,
    s' = {...s, corrupt: true},
  }

  action read = all {
    not(s.readAttempted),
    s' = {...s, readAttempted: true, readSucceeded: not(s.corrupt),
      readRevision: if (s.corrupt) 0 else s.durableRevision,
      exposedStaged: false},
  }

  action step = any {
    stageA, stageB, publishA, publishB, confirmA, confirmB,
    conflictA, conflictB, crashA, crashB, refreshHead, tamper, read,
  }

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
