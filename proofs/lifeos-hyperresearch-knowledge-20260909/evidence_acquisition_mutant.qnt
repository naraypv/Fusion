// Author: Naray Puthillathu
// Deliberately broken model: publishes the first of two hits before the second
// exact fetch fails. Verification must reject the shared all-or-nothing policy.
module evidence_acquisition_mutant {
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
    phase: "new", requestValid: false, described: false,
    compatible: false, ready: false, searched: false, hitCount: 0,
    fetchesVerified: 0, batchVerified: false, providerCalls: 0,
    sinkCalls: 0, sinkAccepted: false, committedItems: 0,
    publishedItems: 0, success: false,
  }

  action start = all {
    s.phase == "new",
    s' = {...s,
      phase: "fetching", requestValid: true, described: true,
      compatible: true, ready: true, searched: true, hitCount: 2,
      providerCalls: 2,
    },
  }

  action publishFirst = all {
    s.phase == "fetching",
    s.fetchesVerified == 0,
    s' = {...s,
      fetchesVerified: 1,
      providerCalls: s.providerCalls + 1,
      publishedItems: 1,
    },
  }

  action failSecond = all {
    s.phase == "fetching",
    s.fetchesVerified == 1,
    s' = {...s, phase: "done", providerCalls: s.providerCalls + 1},
  }

  action step = any {
    start,
    publishFirst,
    failSecond,
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
