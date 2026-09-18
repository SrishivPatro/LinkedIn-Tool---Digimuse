# LinkedIn Tool — Digimuse

An automated lead-generation pipeline. Once a day (or on demand), it searches LinkedIn for posts where someone in India signals they need marketing/agency help, scrapes and scores those people as leads, optionally drafts a personalized outreach message for each one via the Claude API, and writes everything to a Google Sheet.

Runs entirely on GitHub Actions — no server to maintain. Repo: `SrishivPatro/LinkedIn-Tool---Digimuse`.

## What this does, in plain terms

You configure a list of phrases that signal buying intent — things like *"looking for an agency"*, *"need help with marketing"*, *"looking for a freelancer"*. Once a day, the tool searches recent LinkedIn posts for those phrases, keeps only the ones from people based in India, pulls each person's full profile, scores how promising a lead they are, and adds a row to a Google Sheet with their contact info, the post that flagged them, why they look like a good (or weak) lead, and — if you've set it up — a ready-to-send personalized connection request message. You (or whoever works the sheet) then just work down the list.

It never logs into LinkedIn directly or messages anyone automatically — it only reads public post/profile data via a third-party scraping service (Apify) and writes to your own sheet. Sending the actual connection request is still a manual, human step.

## Pipeline flow

```
GitHub Actions (cron 04:00 UTC daily, or manual trigger)
  │
  ├─ 1. Apify post search   — search recent LinkedIn posts for each configured
  │                            intent keyword (apimaestro/linkedin-posts-search-
  │                            scraper-no-cookies), restricted to the last 7 days
  │
  ├─ 2. Dedupe               — merge with any static LINKEDIN_PROFILE_URLS, then
  │                            drop anyone whose LinkedIn username is already a
  │                            row in the sheet; cap the rest to
  │                            MAX_NEW_PROFILES_PER_RUN
  │
  ├─ 3. Apify profile scrape — pull full profile data for each remaining candidate
  │                            (apimaestro/linkedin-profile-detail): name, title,
  │                            company, location, connections
  │
  ├─ 4. India-only filter    — discard any *search-discovered* profile whose
  │                            location isn't in India (static LINKEDIN_PROFILE_URLS
  │                            entries are exempt — they're an explicit ask)
  │
  ├─ 5. Company-news check   — one more Apify search per unique employer, looking
  │                            for funding/hiring-surge posts (adds to scoring only)
  │
  ├─ 6. Scoring              — four 0–100 sub-scores + a High/Medium/Low summary
  │                            (scoring/index.js — pure keyword heuristics, no AI)
  │
  ├─ 7. Connection message   — OPTIONAL: if ANTHROPIC_API_KEY is set, ask Claude
  │      (Claude API)          to draft a short personalized outreach note for
  │                            leads that came from a real post. Skipped (blank
  │                            column) if the key isn't set, or if generation fails.
  │
  └─ 8. Google Sheets write  — append one row per lead; auto-creates/upgrades the
                               header row if columns are missing
```

Each numbered stage is one file:

| Stage | File |
|---|---|
| Orchestration (the flow above) | `index.js` |
| Apify post search + profile scrape + company-news search | `scraper/index.js` |
| Scoring (4 sub-scores, Signal Level, need summary) | `scoring/index.js` |
| Claude-generated connection message | `enrichment/index.js` |
| Google Sheets read/write | `sheets/index.js` |
| Scheduling + secrets wiring | `.github/workflows/daily.yml` |

## Project structure

```
.
├── index.js              # orchestrates the whole pipeline (start here)
├── scraper/index.js       # all Apify calls: post search, profile scrape, company news
├── scoring/index.js       # keyword-based scoring logic, no external calls
├── enrichment/index.js    # Claude API call for the Connection Message column
├── sheets/index.js        # Google Sheets read/write
├── .github/workflows/
│   └── daily.yml          # cron schedule + manual-trigger inputs + secrets wiring
├── .env                   # local-only config (gitignored, never committed)
└── credentials/
    └── google-service-account.json   # local-only Google credentials (gitignored)
```

## Environment variables / GitHub secrets

Set these under **Settings → Secrets and variables → Actions → Repository secrets** for the scheduled/production run. For local development, put them in a `.env` file in the project root instead (already gitignored).

| Name | Required? | What it does | Where to get it |
|---|---|---|---|
| `APIFY_TOKEN` | **Required** | Auth token for both Apify actors (post search and profile scrape). | [Apify Console](https://console.apify.com) → Settings → Integrations → API tokens. |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | **Required** | The Google Sheet the pipeline writes to. | The long ID in the sheet's URL: `docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`. |
| `GOOGLE_SHEETS_CLIENT_EMAIL` | **Required** (for CI) | Service account email used to authenticate to Google Sheets. | [Google Cloud Console](https://console.cloud.google.com) → IAM & Admin → Service Accounts → create one, enable the Sheets API, create a JSON key → `client_email` field in that JSON. **You must also share the target sheet with this email as Editor**, or every run will fail to write. |
| `GOOGLE_SHEETS_PRIVATE_KEY` | **Required** (for CI) | Private key paired with the above. | Same JSON key file → `private_key` field (keep the `\n` newlines as literal `\n` — the code un-escapes them). |
| `LINKEDIN_INTENT_KEYWORDS` | Required to discover new leads | Comma-separated phrases searched against recent LinkedIn posts (e.g. `looking for an agency, need help with marketing`). Without this, the pipeline only processes `LINKEDIN_PROFILE_URLS` if set. | You write these — they're your buying-intent phrases. |
| `APIFY_LINKEDIN_SEARCH_ACTOR_ID` | Optional | Overrides which Apify actor runs the post search. | Defaults to `apimaestro/linkedin-posts-search-scraper-no-cookies`. Only change this if that actor is discontinued or you find a better one — see *Known limits* below on how much verification a swap needs. |
| `LINKEDIN_POST_DATE_FILTER` | Optional | How far back the post search looks. Must be one of: `""`, `past-1h`, `past-24h`, `past-week`, `past-month` (these are the *only* values the actor accepts — confirmed via its own validation error). | Defaults to `past-week`. Set to `past-month` to widen the net at the cost of staler leads. |
| `MAX_NEW_PROFILES_PER_RUN` | Optional | Caps how many new profiles get scraped in a single run (a real cost/quota control — see *Known limits*). | Defaults to `10` in code; currently recommended value is **`25`** (see below). Any candidates beyond the cap just get picked up on a future run, since already-processed ones are deduped. |
| `ANTHROPIC_API_KEY` | Optional | Enables the "Connection Message" column via the Claude API. Pipeline runs fine without it — that column is just left blank. | [console.anthropic.com](https://console.anthropic.com) → Settings → API Keys → Create Key. Requires billing set up on that Anthropic account; each message is a small paid API call. |
| `LINKEDIN_PROFILE_URLS` | Optional | Comma-separated LinkedIn profile URLs to always include, bypassing search *and* the India-only filter. Useful for manually tracked leads. | You supply these directly. |
| `LINKEDIN_COMPANY_NEWS_KEYWORDS` | Optional | Comma-separated phrases used to check each lead's employer for recent funding/hiring news (adds to the Potential score if matched). | Defaults to `funding, series funding, hiring surge, we're hiring`. |
| `APIFY_LINKEDIN_ACTOR_ID` | Optional, **not currently wired into `daily.yml`** | Would override the profile-scrape actor id. | Defaults to `apimaestro/linkedin-profile-detail`. If you need to change this in production, add it to `.github/workflows/daily.yml`'s `env:` block the same way the other secrets are wired — it currently only takes effect via a local `.env`. |

Two unused leftovers from the original project scaffold — `LINKEDIN_EMAIL` and `LINKEDIN_PASSWORD` — still exist in `.env` but nothing in the code reads them. Safe to ignore or delete.

**Local-only alternative for Google auth:** if a `credentials/google-service-account.json` file exists (the full downloaded service-account key, gitignored), `sheets/index.js` uses it instead of `GOOGLE_SHEETS_CLIENT_EMAIL`/`GOOGLE_SHEETS_PRIVATE_KEY`. This only applies to local runs — GitHub Actions has no such file, so CI always uses the two separate secrets.

## Known limits

- **Apify's `linkedin-profile-detail` actor caps out at 20 free-tier profile lookups per day**, enforced by Apify account-wide — not by anything in this code. Once hit, the actor returns a "succeeded" response with no data instead of an error; the code detects this (`Apify run for "..." returned an empty profile, skipping`) and skips the row rather than writing garbage. This is the real ceiling on how many *new* leads can land in the sheet per day on the free tier — `MAX_NEW_PROFILES_PER_RUN` only controls how many are *attempted*, and is set slightly above 20 (at 25) on purpose so a single daily run always tries to use the full quota rather than under-using it. Raising an Apify plan removes this cap; **`MAX_NEW_PROFILES_PER_RUN` is a plain secret, so scaling up later needs no code change — just raise that number.**
- **Posts older than 7 days are excluded by default** (`LINKEDIN_POST_DATE_FILTER=past-week`). There is no "last 14 days" option — the actor only accepts `""`/`past-1h`/`past-24h`/`past-week`/`past-month`. If leads are too scarce, the next-widest option is `past-month` (30 days), at the cost of some staler results.
- **The "Connection Message" column needs `ANTHROPIC_API_KEY`.** Without it, the pipeline runs completely normally — every other column is populated as usual, and this one is just an empty string. It's also left blank for any lead that didn't come from a real discovered post (e.g. manually added `LINKEDIN_PROFILE_URLS` entries), since there's no real post to personalize a message around.
- **The India-only filter only applies to search-discovered leads.** A manually configured `LINKEDIN_PROFILE_URLS` entry bypasses it, since adding one is already an explicit choice.
- **Dedup is by LinkedIn username, not by anything smarter.** If the same person posts twice with different phrasing, they'll only be re-processed if their previous row somehow isn't in the sheet anymore.
- **`APIFY_LINKEDIN_SEARCH_ACTOR_ID` and `APIFY_LINKEDIN_ACTOR_ID` point to third-party Apify actors we don't control.** If either actor changes its accepted input fields or output shape, the pipeline can silently return empty or wrong data rather than erroring loudly — that's exactly what happened during initial setup (see git history on `scraper/index.js`) and is why a schema change to either actor should always be verified with a live test run before trusting it, not just read from that actor's documentation page.

## Running it

### Manually triggering a run

1. GitHub → this repo → **Actions** tab → **Daily LinkedIn Pipeline** (left sidebar) → **Run workflow** button (top right).
2. Optionally fill in the three override inputs (`intent_keywords`, `search_actor_id`, `date_filter`) to test something ad hoc without touching the real secrets — leave them blank to use whatever's configured in secrets.
3. Click **Run workflow**.

Or via the `gh` CLI: `gh workflow run daily.yml --ref claude/nodejs-scraper-scaffold-7t6j7n`

### Checking whether a run succeeded

Actions tab → click into the run → the job is named **run-pipeline**. A green checkmark means it completed; a red X means it threw an uncaught error (rare — most failure modes, like a bad Apify lookup or a missing Claude key, are handled gracefully and just skip that piece of data instead of failing the run).

Expand the **Run pipeline** step to read the log. Useful lines to look for:
- `Found N candidate profile(s) from post search.` — how many posts matched your keywords this run
- `Skipping N profile(s) already in the sheet.` — dedupe working as expected
- `Discarding N discovered profile(s) outside India.` — the geography filter working
- `Daily free-tier limit of 20 profiles reached.` — you've hit the Apify quota for today (see *Known limits*)
- `Done. Wrote N row(s) to the sheet.` — the run's actual output count; this is the line that tells you whether anything landed in the sheet

If you see 0 rows written but no errors, it's almost always either the Apify daily quota being exhausted or nothing matching the freshness window that day — not a bug.

## How to modify common things

**Change the search keywords** — edit the `LINKEDIN_INTENT_KEYWORDS` secret (Settings → Secrets and variables → Actions). Comma-separated phrases; no code change needed.

**Adjust scoring weights** — everything is in `scoring/index.js`, plain keyword lists and arithmetic, no external calls:
- `AGENCY_KEYWORDS` / `INHOUSE_KEYWORDS` — words that push the Agency Need score up or down
- `URGENCY_KEYWORDS` — words that raise the Urgency score
- `DIRECT_ASK_KEYWORDS` — words that raise the Chances score
- `SENIOR_TITLE_KEYWORDS` / `MID_TITLE_KEYWORDS` and the connection-count thresholds inside `scorePotential()` — drives the Potential score
- The point values themselves (`+20`, `+45`, etc.) are just numbers in each `score*()` function — change them directly and re-test with `node -e` against a few sample profiles before pushing.

**Change the daily schedule time** — edit the `cron` line at the top of `.github/workflows/daily.yml`. It's in **UTC**, not IST — the current value `0 4 * * *` is 9:30am IST (IST = UTC+5:30, so 4:00 UTC = 9:30 IST). To change the IST time, subtract 5 hours 30 minutes from your target IST time to get the UTC cron value.

**Change the freshness window** — set the `LINKEDIN_POST_DATE_FILTER` secret to one of `past-1h`, `past-24h`, `past-week`, `past-month`, or `""` for no limit (not recommended — see *Known limits*).

**Change the target country** — edit `isIndianLocation()` in `index.js`; it's currently a simple `/india/i` regex against the scraped location string.

**Change how many profiles are attempted per run** — set the `MAX_NEW_PROFILES_PER_RUN` secret.

**Change the connection-message model, tone, or length limit** — edit `enrichment/index.js`: `MODEL_ID` (currently `claude-sonnet-4-6`), `SYSTEM_PROMPT` (the instructions given to the model), or `MAX_MESSAGE_LENGTH` (currently 300, LinkedIn's connection-note limit).

**Add a new sheet column** — add it to the `SHEET_HEADERS` array and the row-mapping object in `sheets/index.js`; the header row auto-upgrades on the next run without touching existing data.

## Local development

```bash
npm install
cp .env.example .env   # then fill in real values — see the table above
node index.js
```

Local runs read `.env` (via `dotenv`) and, for Google Sheets auth, prefer `credentials/google-service-account.json` if it exists over the two `GOOGLE_SHEETS_*` env vars. Both `.env` and `credentials/` are gitignored — never commit real credentials.
