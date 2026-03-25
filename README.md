# Exa for Airtable

Airtable extension powered by [Exa](https://exa.ai) — the search engine for AI.

## Tools

### Create a Web Table
Search the web with Exa's deep search to find companies, people, or any entities and populate a new Airtable table with the results.

### News Monitor
Create one-time or recurring news monitors using Exa's `/search-monitors` API. Track topics and companies, get deduplicated results delivered on a cron schedule.

### Generate a Report
Ask a question and Exa will search the web and write a long-form summary with cited sources using the `/answer` API.

## Setup

1. Install the extension in your Airtable base (Extensions → Add an extension → Build a custom extension)
2. Point it at this repo or paste the code from `frontend/index.js`
3. Enter your Exa API key (get one free at [dashboard.exa.ai](https://dashboard.exa.ai))

### Local Development

```bash
npm install
block run
```

Requires `@airtable/blocks-cli` — see [Airtable Blocks CLI docs](https://airtable.com/developers/extensions/guides/hello-world-tutorial).

## API Endpoints Used

| Endpoint | Tool |
|---|---|
| `POST /search` (type: deep) | Create a Web Table |
| `POST /search-monitors` | News Monitor (create) |
| `POST /search-monitors/{id}/trigger` | News Monitor (run) |
| `GET /search-monitors/{id}/runs` | News Monitor (poll) |
| `DELETE /search-monitors/{id}` | News Monitor (cleanup) |
| `POST /answer` | Generate a Report |

All requests include `x-exa-integration: airtable` header for usage tracking.

## License

MIT No Attribution — see [LICENSE.md](LICENSE.md)
