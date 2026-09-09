// Author: Naray Puthillathu
module evidence_acquisition_test {
  import evidence_acquisition.* from "./evidence_acquisition"

  run invalidRequestTest = init
    .then(preflight(false))
    .then(rejectInvalid)
    .expect(s.phase == "done" and s.providerCalls == 0 and s.sinkCalls == 0)

  run incompatibleProviderTest = init
    .then(preflight(true))
    .then(describeReject(false, true))
    .expect(not(s.success) and s.providerCalls == 1 and s.sinkCalls == 0)

  run unreadyProviderTest = init
    .then(preflight(true))
    .then(describeReject(true, false))
    .expect(not(s.success) and s.providerCalls == 1 and s.sinkCalls == 0)

  run searchFailureTest = init
    .then(preflight(true))
    .then(describeAccept)
    .then(searchReject)
    .expect(not(s.success) and s.providerCalls == 2 and s.sinkCalls == 0)

  run emptySuccessTest = init
    .then(preflight(true))
    .then(describeAccept)
    .then(searchEmpty)
    .expect(s.success and s.batchVerified and s.hitCount == 0 and s.sinkCalls == 0)

  run oneHitSuccessTest = init
    .then(preflight(true))
    .then(describeAccept)
    .then(searchNonEmpty(1))
    .then(fetchFinal)
    .then(commitAccept)
    .expect(s.success and s.committedItems == 1 and s.publishedItems == 1)

  run twoHitSuccessTest = init
    .then(preflight(true))
    .then(describeAccept)
    .then(searchNonEmpty(2))
    .then(fetchIntermediate)
    .then(fetchFinal)
    .then(commitAccept)
    .expect(s.success and s.fetchesVerified == 2 and s.sinkCalls == 1)

  run firstFetchFailureTest = init
    .then(preflight(true))
    .then(describeAccept)
    .then(searchNonEmpty(2))
    .then(fetchReject)
    .expect(not(s.success) and s.publishedItems == 0 and s.sinkCalls == 0)

  run laterFetchFailureTest = init
    .then(preflight(true))
    .then(describeAccept)
    .then(searchNonEmpty(2))
    .then(fetchIntermediate)
    .then(fetchReject)
    .expect(not(s.success) and s.fetchesVerified == 1 and s.publishedItems == 0)

  run sinkRejectTest = init
    .then(preflight(true))
    .then(describeAccept)
    .then(searchNonEmpty(1))
    .then(fetchFinal)
    .then(commitReject)
    .expect(not(s.success) and s.sinkCalls == 1 and s.committedItems == 0)
}
