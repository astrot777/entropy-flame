# Entropy

**A fire-safety atlas of microgravity combustion research.** Built for the NASA Space Apps Challenge 2026, challenge *Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data*.

Entropy is for researchers and spacecraft fire-safety engineers who need to compare NASA microgravity combustion experiments side by side. It reads NASA Physical Sciences Informatics (PSI) combustion investigations and turns each one into a row of 12 facts, such as fuel, oxygen, pressure, airflow, hardware, and sensors. Every value links to the exact sentence or test-table line it came from, and anything the record doesn't support reads "Not stated". You can add any other PSI investigation live, in about 10 to 15 seconds.

Entropy doesn't score fire risk, convert units, or replace reading the original records.

**Live site:** [entropy-flame.vercel.app](https://entropy-flame.vercel.app) — opens without a login.

## What it does

The dashboard has three parts:

- **Catalogue**: the 19 combustion investigations named in the challenge, with search and filters. Click any value to see its source quote and a link to the PSI record.
- **Compare**: select 2 to 4 investigations to see which facts are the same, different, or not stated.
- **Add live**: enter any PSI investigation ID. A large language model (LLM) reads the record, and each value appears after code checks its quote against the source. Live rows are marked **Unreviewed** and disappear when you reload the page.

## How it works

Each investigation goes through three steps:

1. Entropy fetches the PSI record and its experimental-table CSV files, then summarizes each CSV file deterministically: the minimum and maximum of every numeric column, with the units the column header gives.
2. An LLM extracts the 12 fields, one JSON line per field, each with a word-for-word quote from the record.
3. Code keeps a value only if its quote appears in the source text and the value appears inside the quote. Numbers are never converted.

The project is written in TypeScript and runs on Node.js, with Hono for the API, Vite for the dashboard, and Vitest for tests. The live site is hosted on Vercel.

## Use of Super Intelligence (SI)

- **In the product**: an LLM, chosen by the `LLM_MODEL` setting, extracts the values in `data/investigations.json` and in live rows, and code then verifies each value against its source. The data file's `meta.generatedBy` field records this. The **Objectives** column is an LLM-written summary; every other value is copied from its quote.
- **In development**: an LLM coding assistant helped write and test the code. The idea, the challenge choice, and every design decision are the team's, and the team reviewed all code.
- Entropy uses no SI-generated images, video, or audio.

## NASA data

Entropy uses [NASA Physical Sciences Informatics (PSI)](https://psi.nasa.gov/): the Combustion Science investigations and their experimental tables. Each PSI record states its own license, for example CC0-1.0 on PSI-159.

## Run Entropy locally

Before you begin, make sure you have:

- Node.js 20 or later
- An API key and a model ID from an LLM provider supported by the SDK listed in [References](#references)

To run Entropy on your computer:

1. Install the dependencies:

   ```
   npm install
   ```

2. Copy `.env.example` to a new file named `.env`, then set `LLM_API_KEY` to your API key and `LLM_MODEL` to your model ID.

3. Build the dashboard into `dist/web`:

   ```
   npm run build
   ```

4. Start the dashboard and the API:

   ```
   npm run api
   ```

   The terminal shows `Entropy on http://localhost:8787`. Open that address in your browser.

5. Optional: rebuild the data file from PSI:

   ```
   npx tsx --env-file=.env scripts/ingest-batch.ts data/ids.txt --out data/investigations.json
   ```

To run the tests, use the following command:

```
npm test
```

## Team

Team "be alone, that is when ideas are born." (Riyadh Local Event). Member: [astrot777](https://github.com/astrot777).

## References

Entropy uses the following open-source code and resources:

- [NASA Physical Sciences Informatics (PSI)](https://psi.nasa.gov/): combustion investigation records and experimental tables
- [@anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk) (Apache-2.0): LLM API client
- [Hono](https://hono.dev/) and [@hono/node-server](https://www.npmjs.com/package/@hono/node-server) (MIT): API server
- [Vite](https://vite.dev/) (MIT): dashboard build
- [Vercel](https://vercel.com/) (Hobby plan): hosting
- [Vitest](https://vitest.dev/) and [jsdom](https://www.npmjs.com/package/jsdom) (MIT): tests
- [tsx](https://www.npmjs.com/package/tsx) (MIT) and [TypeScript](https://www.typescriptlang.org/) (Apache-2.0): runtime and language
- [IBM Plex](https://fonts.google.com/?query=IBM+Plex) fonts through Google Fonts (SIL Open Font License)

## License

The code is released under the [MIT License](LICENSE). NASA PSI data keeps the license stated on each PSI record.
