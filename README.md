# Entropy

**A fire-safety atlas of microgravity combustion research.** Built for the NASA Space Apps Challenge 2026, challenge *Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data*.

Entropy is for researchers and spacecraft fire-safety engineers who need to compare NASA microgravity combustion experiments side by side. It reads NASA Physical Sciences Informatics (PSI) combustion investigations and turns each one into a row of 12 facts, such as fuel, oxygen, pressure, airflow, hardware, and sensors. Every value links to the exact sentence or test-table line it came from, and anything the record doesn't support reads "Not stated". You can add any other PSI investigation live, in about 10 to 15 seconds.

Entropy doesn't score fire risk, change NASA's numbers, or replace reading the original records.

**Live site:** [entropy-flame.vercel.app](https://entropy-flame.vercel.app) - opens without a login. **Demo deck:** [7 slides (PDF)](docs/Entropy-NASA-Space-Apps-2026.pdf).

## What it does

The dashboard has four parts:

- **Catalogue**: the 19 combustion investigations named in the challenge, with search and filters. Click any value to see its source quote and a link to the PSI record.
- **Compare**: select 2 to 4 investigations to see which facts are the same, different, or not stated.
- **Tested atmospheres**: a chart of every test in NASA's experimental tables that records both oxygen and pressure (747 tests in 4 investigations), against the three crew atmospheres NASA names in the PSI-20 record: 14.7 psia with 21% oxygen, 10.2 psia with 26.5%, and 8.2 psia with 34%. It counts the tests inside a zone around each one and names the closest test when a zone is empty. Hover over a dot to see its table, row, and cells as written.
- **Compared with ISS cabin air**: every stated oxygen and pressure value carries a tag that places it against the air on the International Space Station, 21% oxygen at 14.7 psia, as given in [a NASA technical brief on habitable atmospheres](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-003-habitable-atmosphere.pdf). A filter shows the experiments with more oxygen than the station. Units are converted only for this comparison, and it compares conditions; it isn't a fire-risk score.
- **Experiment view**: select **3D** on any row to see a schematic of the experiment built only from that row's stated values: the sample's shape and proportions, the airflow speed, the enclosure, and the sensors. Parts NASA doesn't state stay grey, and selecting a part shows its source quote. Moving lines show the stated airflow speed. The schematic isn't to scale and isn't a physical simulation: shapes, layout, and surface textures are illustrative, and no flame is drawn.
- **Add live**: enter any PSI investigation ID. A large language model (LLM) reads the record, and each value appears after code checks its quote against the source. Live rows are marked **Unreviewed** and disappear when you reload the page.

## How it works

Each investigation goes through three steps:

1. Entropy fetches the PSI record and its experimental-table CSV files, then summarizes each CSV file deterministically: the minimum and maximum of every column that is mostly numbers, or the listed values of a column that holds lists, with the units the column header gives.
2. An LLM extracts the 12 fields, one JSON line per field, each with a supporting quote: a sentence copied from the record, or one of the table summary lines from step 1.
3. Code keeps a value only if its quote appears in the source text and the value appears inside the quote. Numbers are never converted or corrected.

## Limits

- The check in step 3 is a text match. It traces a value to its source; it doesn't confirm the scientific interpretation.
- **Objectives** is a summary and **Pillar** is a classification, both written by the LLM, so the value isn't required to appear inside the quote for these two fields.
- A table quote is a summary line that Entropy computed from one column. It isn't NASA's wording, and the source panel says so.
- "Not stated" means Entropy found no supporting text in what it read. The record might still state the fact elsewhere. Entropy reads up to 6 table files per investigation.
- A value that can't be right as written, such as an oxygen percentage above 100 in a NASA table, stays as written and gets a **Check source** note.
- Compare matches text as written. Two ways of writing the same quantity show as different.
- A hand check of 55 cells in 5 investigations found 53 correct and 2 wrong (PSI-159 Pillar and Fuel). That sample doesn't establish the accuracy of the whole catalogue.

The project is written in TypeScript and runs on Node.js, with Hono for the API, Vite for the dashboard, and Vitest for tests. The live site is hosted on Vercel.

## Use of Super Intelligence (SI)

- **In the product**: an LLM, chosen by the `LLM_MODEL` setting, extracts the values in `data/investigations.json` and in live rows, and code then verifies each value against its source. The data file's `meta.generatedBy` field records this. The **Objectives** column is an LLM-written summary and the **Pillar** column is an LLM classification; every other value is copied from its quote.
- **In development**: an LLM coding assistant helped write the code. The idea, the challenge choice, and every design decision are the team's, including the 3D experiment view. The team checked 55 extracted values by hand against NASA's records, directed the fixes, and tested the live site.
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

be alone, that is when ideas are born.

## References

Entropy uses the following open-source code and resources:

- [NASA Physical Sciences Informatics (PSI)](https://psi.nasa.gov/): combustion investigation records and experimental tables
- [@anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk) (Apache-2.0): LLM API client
- [Hono](https://hono.dev/) and [@hono/node-server](https://www.npmjs.com/package/@hono/node-server) (MIT): API server
- [Vite](https://vite.dev/) (MIT): dashboard build
- [three.js](https://threejs.org/) (MIT): the 3D experiment view
- [Vercel](https://vercel.com/) (Hobby plan): hosting
- [Vitest](https://vitest.dev/) and [jsdom](https://www.npmjs.com/package/jsdom) (MIT): tests
- [tsx](https://www.npmjs.com/package/tsx) (MIT) and [TypeScript](https://www.typescriptlang.org/) (Apache-2.0): runtime and language
- [IBM Plex](https://fonts.google.com/?query=IBM+Plex) fonts through Google Fonts (SIL Open Font License)
- [Playwright](https://playwright.dev/) (Apache-2.0): screenshots of the live site for the demo deck

## License

The code is released under the [MIT License](LICENSE). NASA PSI data keeps the license stated on each PSI record.
