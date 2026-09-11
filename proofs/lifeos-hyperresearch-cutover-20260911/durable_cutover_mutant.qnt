// Author: Naray Puthillathu
// Deliberately unsafe implementation: either activates through volatile legacy
// fallback when the store is unavailable, or writes a journal from a stale
// journal cursor. The production invariant must reject both behaviors.
module durable_cutover_mutant {
  type State = {
    phase: str,
    manifestValid: bool,
    approvalMatches: bool,
    storeAvailable: bool,
    projectMatches: bool,
    journalMatches: bool,
    activated: bool,
    deactivated: bool,
    authorized: bool,
    projectExpected: bool,
    journalExpected: bool,
    operation: str,
    writeAttempts: int,
    projectWrites: int,
    journalWrites: int,
    retries: int,
    conflict: bool,
    unknown: bool,
    otherChanged: bool,
    truthfulReceipt: bool,
    legacyCalls: int,
    legacyWrites: int,
    fallbackUsed: bool,
    sourceDeleted: bool,
    success: bool,
  }

  var s: State

  action init = s' = {
    phase: "new", manifestValid: false, approvalMatches: false,
    storeAvailable: false, projectMatches: false, journalMatches: false,
    activated: false, deactivated: false, authorized: false,
    projectExpected: false, journalExpected: false, operation: "none",
    writeAttempts: 0, projectWrites: 0, journalWrites: 0, retries: 0,
    conflict: false, unknown: false, otherChanged: false,
    truthfulReceipt: false, legacyCalls: 0, legacyWrites: 0,
    fallbackUsed: false, sourceDeleted: false, success: false,
  }

  pure def activationAllowed(x: State): bool =
    x.manifestValid and x.approvalMatches and x.storeAvailable and
    x.projectMatches and x.journalMatches

  pure def cursorAllowed(x: State): bool =
    x.activated and not(x.deactivated) and x.authorized and
    x.projectExpected and x.journalExpected

  action configureUnavailable = all {
    s.phase == "new",
    s' = {...s,
      phase: "configured", manifestValid: true, approvalMatches: true,
      storeAvailable: false, projectMatches: true, journalMatches: true,
    },
  }

  action fallbackActivate = all {
    s.phase == "configured",
    s' = {...s,
      phase: "done", activated: true, fallbackUsed: true,
      legacyCalls: 1, success: true, truthfulReceipt: true,
    },
  }

  action configureStaleWrite = all {
    s.phase == "new",
    s' = {...s,
      phase: "operating", manifestValid: true, approvalMatches: true,
      storeAvailable: true, projectMatches: true, journalMatches: true,
      activated: true, authorized: true, projectExpected: true,
      journalExpected: false, operation: "evidence",
    },
  }

  action writeFromStaleCursor = all {
    s.phase == "operating",
    s' = {...s,
      phase: "done", writeAttempts: 1, journalWrites: 1,
      success: true, truthfulReceipt: true,
    },
  }

  action step = any {
    configureUnavailable,
    fallbackActivate,
    configureStaleWrite,
    writeFromStaleCursor,
    all { s.phase == "done", s' = s },
  }

  val activationIsFullyGated = s.activated implies activationAllowed(s)
  val noLegacyAccess =
    s.legacyCalls == 0 and s.legacyWrites == 0 and not(s.fallbackUsed)
  val sourceIsRetained = not(s.sourceDeleted)
  val oneWriteAttempt =
    s.writeAttempts <= 1 and s.retries == 0 and
    s.projectWrites <= 1 and s.journalWrites <= 1 and
    s.projectWrites + s.journalWrites <= 1
  val writesRequireExactCursor =
    (s.projectWrites > 0 implies
      (s.operation == "project" and cursorAllowed(s))) and
    (s.journalWrites > 0 implies
      (s.operation == "evidence" and cursorAllowed(s)))
  val rejectedActivationWritesNothing =
    (s.phase == "done" and not(s.activated) and s.operation == "none") implies
      (s.writeAttempts == 0 and s.projectWrites == 0 and s.journalWrites == 0)
  val rejectedCursorWritesNothing =
    (s.phase == "done" and s.operation != "none" and not(cursorAllowed(s))) implies
      (s.writeAttempts == 0 and s.projectWrites == 0 and s.journalWrites == 0)
  val successfulOperationIsGated = s.success implies
    (s.activated and not(s.deactivated) and s.authorized and
      s.projectExpected and s.journalExpected and
      not(s.conflict) and not(s.unknown) and s.truthfulReceipt)
  val failureIsNotSuccess = (s.conflict or s.unknown) implies not(s.success)
  val concurrentChangeIsReported = s.otherChanged implies s.truthfulReceipt
  val deactivationIsReadOnly = s.deactivated implies
    (s.writeAttempts == 0 and s.projectWrites == 0 and s.journalWrites == 0)

  val invariant =
    activationIsFullyGated and noLegacyAccess and sourceIsRetained and
    oneWriteAttempt and writesRequireExactCursor and
    rejectedActivationWritesNothing and rejectedCursorWritesNothing and
    successfulOperationIsGated and failureIsNotSuccess and
    concurrentChangeIsReported and deactivationIsReadOnly
}
