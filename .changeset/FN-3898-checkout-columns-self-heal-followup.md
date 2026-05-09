---
"@runfusion/fusion": patch
---

Wire the checkout-lease column self-heal as an unconditional startup compatibility backfill (`ensureTasksSchemaCompatibility`) so legacy or mesh-synced task databases no longer fail with `no such column: checkoutNodeId` when schemaVersion is already past migration 20.
