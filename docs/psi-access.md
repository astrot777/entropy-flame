# How Entropy reads NASA PSI

Re-verified 2026-11-14 against the live site. These are undocumented endpoints behind NASA's own PSI pages, not a published API: keep request volume low and cache results.

- Investigation record: `GET https://psi.nasa.gov/geode-py/ws/repo/investigations/<ID>` returns JSON, no key. A missing ID returns HTTP 403 (treated as "not found").
- All investigations: `GET https://psi.nasa.gov/geode-py/ws/repo/search?source=psi&type=investigation&size=200`.
- Experimental tables: each record lists CSV files in `experimentalTable[].file_name`. `GET https://psi.nasa.gov/geode-py/ws/studies/<ID>/download?file=<name>&version=1&redirect=false` returns a short-lived signed link on `psi-repo-prod.s3.amazonaws.com`; the code follows it only on that host and never stores or logs it.
- Entropy builds one plain-text document per investigation: the labelled text fields (title, objectives, approach, hypothesis, impacts, type, flight program, hardware, research area) plus, for each CSV, a deterministic summary line per numeric column: min, max and row count, with the column header's own units. Nothing is converted.
- Data licence: PSI records state their own licence (`licenseIdentifier`, for example CC0-1.0 on PSI-159).
