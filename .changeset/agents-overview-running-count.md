---
"@runfusion/fusion": patch
---

Fix the misleading "X active · Y running" label in the Agents overview
dropdown. Both numbers previously counted agents whose state was either
`active` or `running`, so the "running" tally over-reported by including
idle-but-enabled agents. The label now counts each state distinctly:
"active" reflects only `state === "active"` and "running" reflects only
`state === "running"`.
