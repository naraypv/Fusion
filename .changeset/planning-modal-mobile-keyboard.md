---
"@fusion/dashboard": patch
---

Fix Planning Mode modal getting stuck at partial height on mobile. Two issues: (1) `useModalResizePersist` was replaying a desktop-saved pixel height into the inline `style` attribute, overriding the mobile `height: 100dvh` rule and leaving the modal at half-screen even before the keyboard appeared — now skipped on touch devices ≤768px wide. (2) When the iOS keyboard was dismissed, React reconciled the removed CSS custom properties (`--vv-height`, `--keyboard-overlap`, `--vv-offset-top`) by setting them to empty string instead of calling `removeProperty()`. On Safari that left `var(--vv-height, 100dvh)` resolving to empty (the fallback only kicks in when the variable is undefined), collapsing the modal to content height — now driven imperatively via `setProperty`/`removeProperty` on the modal ref.
