// Author: Naray Puthillathu
// Finite shared-state abstraction of explicit durable caller cutover.
module durable_cutover {
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
    phase: "new",
    manifestValid: false,
    approvalMatches: false,
    storeAvailable: false,
    projectMatches: false,
    journalMatches: false,
    activated: false,
    deactivated: false,
    authorized: false,
    projectExpected: false,
    journalExpected: false,
    operation: "none",
    writeAttempts: 0,
    projectWrites: 0,
    journalWrites: 0,
    retries: 0,
    conflict: false,
    unknown: false,
    otherChanged: false,
    truthfulReceipt: false,
    legacyCalls: 0,
    legacyWrites: 0,
    fallbackUsed: false,
    sourceDeleted: false,
    success: false,
  }

  pure def activationAllowed(x: State): bool =
    x.manifestValid and x.approvalMatches and x.storeAvailable and
    x.projectMatches and x.journalMatches

  pure def cursorAllowed(x: State): bool =
    x.activated and not(x.deactivated) and x.authorized and
    x.projectExpected and x.journalExpected

  action configure(
      manifestValid: bool,
      approvalMatches: bool,
      storeAvailable: bool,
      projectMatches: bool,
      journalMatches: bool): bool = all {
    s.phase == "new",
    s' = {...s,
      phase: "configured",
      manifestValid: manifestValid,
      approvalMatches: approvalMatches,
      storeAvailable: storeAvailable,
      projectMatches: projectMatches,
      journalMatches: journalMatches,
    },
  }

  action activate = all {
    s.phase == "configured",
    activationAllowed(s),
    s' = {...s, phase: "active", activated: true, truthfulReceipt: true},
  }

  action rejectActivation = all {
    s.phase == "configured",
    not(activationAllowed(s)),
    s' = {...s, phase: "done"},
  }

  action chooseOperation(
      operation: str,
      authorized: bool,
      projectExpected: bool,
      journalExpected: bool): bool = all {
    s.phase == "active",
    Set("read", "project", "evidence").contains(operation),
    s' = {...s,
      phase: "operating",
      operation: operation,
      authorized: authorized,
      projectExpected: projectExpected,
      journalExpected: journalExpected,
      truthfulReceipt: false,
    },
  }

  action rejectOperation = all {
    s.phase == "operating",
    not(cursorAllowed(s)),
    s' = {...s, phase: "done"},
  }

  action readSuccess = all {
    s.phase == "operating",
    s.operation == "read",
    cursorAllowed(s),
    s' = {...s, phase: "done", success: true, truthfulReceipt: true},
  }

  action projectSuccess(otherChanged: bool): bool = all {
    s.phase == "operating",
    s.operation == "project",
    cursorAllowed(s),
    s' = {...s,
      phase: "done",
      writeAttempts: 1,
      projectWrites: 1,
      otherChanged: otherChanged,
      truthfulReceipt: true,
      success: true,
    },
  }

  action evidenceSuccess(otherChanged: bool): bool = all {
    s.phase == "operating",
    s.operation == "evidence",
    cursorAllowed(s),
    s' = {...s,
      phase: "done",
      writeAttempts: 1,
      journalWrites: 1,
      otherChanged: otherChanged,
      truthfulReceipt: true,
      success: true,
    },
  }

  action projectConflict = all {
    s.phase == "operating",
    s.operation == "project",
    cursorAllowed(s),
    s' = {...s, phase: "done", writeAttempts: 1, conflict: true},
  }

  action evidenceConflict = all {
    s.phase == "operating",
    s.operation == "evidence",
    cursorAllowed(s),
    s' = {...s, phase: "done", writeAttempts: 1, conflict: true},
  }

  action projectUnknown = all {
    s.phase == "operating",
    s.operation == "project",
    cursorAllowed(s),
    s' = {...s, phase: "done", writeAttempts: 1, unknown: true},
  }

  action evidenceUnknown = all {
    s.phase == "operating",
    s.operation == "evidence",
    cursorAllowed(s),
    s' = {...s, phase: "done", writeAttempts: 1, unknown: true},
  }

  action deactivate = all {
    s.phase == "active",
    s' = {...s,
      phase: "done",
      deactivated: true,
      truthfulReceipt: true,
    },
  }

  action step = any {
    {
      nondet manifestValid = Set(false, true).oneOf()
      nondet approvalMatches = Set(false, true).oneOf()
      nondet storeAvailable = Set(false, true).oneOf()
      nondet projectMatches = Set(false, true).oneOf()
      nondet journalMatches = Set(false, true).oneOf()
      configure(manifestValid, approvalMatches, storeAvailable, projectMatches, journalMatches)
    },
    activate,
    rejectActivation,
    {
      nondet operation = Set("read", "project", "evidence").oneOf()
      nondet authorized = Set(false, true).oneOf()
      nondet projectExpected = Set(false, true).oneOf()
      nondet journalExpected = Set(false, true).oneOf()
      chooseOperation(operation, authorized, projectExpected, journalExpected)
    },
    rejectOperation,
    readSuccess,
    {
      nondet changed = Set(false, true).oneOf()
      projectSuccess(changed)
    },
    {
      nondet changed = Set(false, true).oneOf()
      evidenceSuccess(changed)
    },
    projectConflict,
    evidenceConflict,
    projectUnknown,
    evidenceUnknown,
    deactivate,
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
