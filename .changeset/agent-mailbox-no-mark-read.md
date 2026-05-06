---
"@runfusion/fusion": patch
---

Stop the dashboard from auto-marking another agent's messages as read when
the user opens them while browsing that agent's mailbox. Previously, viewing
a message in an agent's inbox (e.g. the CEO's mailbox) would call
`POST /messages/:id/read`, which silently consumed the agent's unread state.
The agent's heartbeat would then never see the message as pending, and the
agent's `fn_read_messages` tool (which defaults to `unread_only: true`)
returned nothing. The mark-as-read call now only fires for the dashboard
user's own inbox tab.
