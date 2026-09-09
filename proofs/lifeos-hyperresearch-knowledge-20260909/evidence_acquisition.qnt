// Author: Naray Puthillathu
// Finite abstraction of provider-neutral evidence acquisition and one-shot
// publication. Provider/fetch/sink outcomes are independent observations.
module evidence_acquisition {
  type State = {
    phase: str,
    requestValid: bool,
    described: bool,
    compatible: bool,
    ready: bool,
    searched: bool,
    hitCount: int,
    fetchesVerified: int,
    batchVerified: bool,
    providerCalls: int,
    sinkCalls: int,
    sinkAccepted: bool,
    committedItems: int,
    publishedItems: int,
    success: bool,
  }

  var s: State

  action init = s' = {
    phase: "new",
    requestValid: false,
    described: false,
    compatible: false,
    ready: false,
    searched: false,
    hitCount: 0,
    fetchesVerified: 0,
    batchVerified: false,
    providerCalls: 0,
    sinkCalls: 0,
    sinkAccepted: false,
    committedItems: 0,
    publishedItems: 0,
    success: false,
  }

  action preflight(valid: bool): bool = all {
    s.phase == "new",
    s' = {...s, phase: "preflight", requestValid: valid},
  }

  action rejectInvalid = all {
    s.phase == "preflight",
    not(s.requestValid),
    s' = {...s, phase: "done"},
  }

  action describeAccept = all {
    s.phase == "preflight",
    s.requestValid,
    s' = {...s,
      phase: "described",
      described: true,
      compatible: true,
      ready: true,
      providerCalls: s.providerCalls + 1,
    },
  }

  action describeReject(compatible: bool, ready: bool): bool = all {
    s.phase == "preflight",
    s.requestValid,
    not(compatible and ready),
    s' = {...s,
      phase: "done",
      described: true,
      compatible: compatible,
      ready: ready,
      providerCalls: s.providerCalls + 1,
    },
  }

  action searchReject = all {
    s.phase == "described",
    s' = {...s,
      phase: "done",
      searched: true,
      providerCalls: s.providerCalls + 1,
    },
  }

  action searchEmpty = all {
    s.phase == "described",
    s' = {...s,
      phase: "done",
      searched: true,
      hitCount: 0,
      batchVerified: true,
      providerCalls: s.providerCalls + 1,
      success: true,
    },
  }

  action searchNonEmpty(hits: int): bool = all {
    s.phase == "described",
    Set(1, 2).contains(hits),
    s' = {...s,
      phase: "fetching",
      searched: true,
      hitCount: hits,
      providerCalls: s.providerCalls + 1,
    },
  }

  action fetchIntermediate = all {
    s.phase == "fetching",
    s.fetchesVerified + 1 < s.hitCount,
    s' = {...s,
      fetchesVerified: s.fetchesVerified + 1,
      providerCalls: s.providerCalls + 1,
    },
  }

  action fetchFinal = all {
    s.phase == "fetching",
    s.fetchesVerified + 1 == s.hitCount,
    s' = {...s,
      phase: "verified",
      fetchesVerified: s.fetchesVerified + 1,
      batchVerified: true,
      providerCalls: s.providerCalls + 1,
    },
  }

  action fetchReject = all {
    s.phase == "fetching",
    s' = {...s,
      phase: "done",
      providerCalls: s.providerCalls + 1,
    },
  }

  action commitAccept = all {
    s.phase == "verified",
    s.hitCount > 0,
    s' = {...s,
      phase: "done",
      sinkCalls: 1,
      sinkAccepted: true,
      committedItems: s.hitCount,
      publishedItems: s.hitCount,
      success: true,
    },
  }

  action commitReject = all {
    s.phase == "verified",
    s.hitCount > 0,
    s' = {...s,
      phase: "done",
      sinkCalls: 1,
      sinkAccepted: false,
    },
  }

  action step = any {
    {
      nondet valid = Set(false, true).oneOf()
      preflight(valid)
    },
    rejectInvalid,
    describeAccept,
    {
      nondet compatible = Set(false, true).oneOf()
      nondet ready = Set(false, true).oneOf()
      describeReject(compatible, ready)
    },
    searchReject,
    searchEmpty,
    {
      nondet hits = Set(1, 2).oneOf()
      searchNonEmpty(hits)
    },
    fetchIntermediate,
    fetchFinal,
    fetchReject,
    commitAccept,
    commitReject,
    all { s.phase == "done", s' = s },
  }

  val invalidRequestCallsNothing =
    not(s.requestValid) implies (s.providerCalls == 0 and s.sinkCalls == 0)
  val providerCallsRequireValidRequest =
    s.providerCalls > 0 implies s.requestValid
  val verifiedBatchHasEveryFetch =
    s.batchVerified implies s.fetchesVerified == s.hitCount
  val sinkOnlyAfterVerification =
    s.sinkCalls > 0 implies (s.batchVerified and s.hitCount > 0)
  val atMostOneSinkCall = s.sinkCalls <= 1
  val committedAllOrNothing =
    s.committedItems == 0 or s.committedItems == s.hitCount
  val publishedAllOrNothing =
    s.publishedItems == 0 or s.publishedItems == s.hitCount
  val publicationEqualsCommit = s.publishedItems == s.committedItems
  val failedAcquisitionPublishesNothing =
    (s.phase == "done" and not(s.batchVerified)) implies
      (s.sinkCalls == 0 and s.committedItems == 0 and
        s.publishedItems == 0 and not(s.success))
  val emptySuccessHasNoSink =
    (s.success and s.hitCount == 0) implies
      (s.batchVerified and s.sinkCalls == 0 and
        s.committedItems == 0 and s.publishedItems == 0)
  val successIsFullyGated =
    s.success implies (
      s.requestValid and s.described and s.compatible and s.ready and s.searched and
      s.batchVerified and
      (s.hitCount == 0 or
        (s.sinkCalls == 1 and s.sinkAccepted and
          s.committedItems == s.hitCount and s.publishedItems == s.hitCount)))

  val invariant =
    invalidRequestCallsNothing and providerCallsRequireValidRequest and
    verifiedBatchHasEveryFetch and sinkOnlyAfterVerification and
    atMostOneSinkCall and committedAllOrNothing and publishedAllOrNothing and
    publicationEqualsCommit and failedAcquisitionPublishesNothing and
    emptySuccessHasNoSink and successIsFullyGated
}
