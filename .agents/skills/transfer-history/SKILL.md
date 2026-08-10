---
name: transfer-history
description: Transfer History knowledge.
---

# Transfer History

## Concept
Differentiate between `Active Transfer` and `Historical Transfer`.

- Do not write to the database every time progress changes if it causes write amplification.
- Mock data currently exists in the Mobile UI (`mobile_UI/App.js`) for History.
- A full implementation should support: Search, Filter, Sort, Pagination, Statistics, and Delete.
