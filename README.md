# Entropy

**A fire-safety atlas of microgravity combustion research.** NASA Space Apps Challenge 2026, challenge *Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data*.

Entropy reads NASA Physical Sciences Informatics (PSI) combustion investigations and turns each one into a comparable row of 12 facts (fuel, oxygen, pressure, airflow, hardware, sensors and more). Every value links to the exact sentence or test-table line it came from; anything the record does not support reads "Not stated". Any PSI investigation can be added live in seconds.

## What it does
- **Catalogue**: the 19 combustion investigations named in the challenge, with search and filters. Click any value to see its source quote and the PSI record.
- **Compare**: pick 2 to 4 investigations and see which facts are the same, different or not stated.
- **Add live**: type any PSI ID; an LLM reads the record and each value appears once code has checked its quote against the source. Live rows are marked Unreviewed and stay in your browser session only.

## How it works
1. Fetch the PSI record (text fields) and its experimental-table CSVs; summarise each CSV deterministically (min and max per numeric column, units as written).
2. An LLM extracts the 12 fields as one JSON line each, with a verbatim quote.
3. Code keeps a value only if its quote appears in the source text and the value appears inside the quote. Numbers are never converted.

Stack: TypeScript, Node, Hono, Vite, an LLM API, Azure App Service. Tests: Vitest.

## Use of Super Intelligence (SI)
- **In the product**: values in `data/investigations.json` and in live rows are extracted by a large language model (LLM, chosen by the `LLM_MODEL` setting) and then verified by code against the source; the file's `meta.generatedBy` says so. The Objectives column is an AI-written summary; every other value is copied from its quote.
- **In development**: an LLM coding assistant helped write and test the code; the idea, the challenge choice and every design decision are the team's, and all code was reviewed by the team.
- No SI-generated images or video are used.

## NASA data
- NASA Physical Sciences Informatics (PSI), Combustion Science investigations and their experimental tables: https://psi.nasa.gov/ (each record states its own licence, for example CC0-1.0).

## Run it
```
npm install
cp .env.example .env        # add your LLM_API_KEY
npm run build               # builds the dashboard into dist/web
npm run api                 # dashboard + API on http://localhost:8787
npx tsx --env-file=.env scripts/ingest-batch.ts data/ids.txt --out data/investigations.json   # rebuild the data
npm test
```

## Team
Team "be alone, that is when ideas are born." (Riyadh Local Event).

## References
LLM API SDK for TypeScript, Hono, @hono/node-server, Vite, Vitest, jsdom, tsx, TypeScript; IBM Plex fonts (Google Fonts, SIL OFL). Licence: MIT (code).
