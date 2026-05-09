---
"@runfusion/fusion": patch
---

Add a `dedupeRetentionDays` setting to the WhatsApp chat plugin (default 7 days) and prune old `whatsapp_chat_dedupe` rows on each inbound message to prevent unbounded dedupe-table growth.
