# Exa for Airtable

Airtable extension powered by [Exa](https://exa.ai) that searches the web and populates tables with structured results.

Enter a query, Exa runs a deep search with structured extraction (`outputSchema`), and the results appear as a new Airtable table — pre-filled with columns like Name, Short Description, Category, Website, Headquarters, Founded, Employees, and Funding.

## Setup

1. Install the extension in your Airtable base (Extensions → Add an extension → Build a custom extension)
2. Point the block at this repo's `frontend/index.js` (entry defined in `block.json`)
3. Enter your Exa API key (get one free at [dashboard.exa.ai](https://dashboard.exa.ai))

API calls are proxied through a Vercel serverless function (`api/proxy.js` deployed at `exa-proxy.vercel.app`) to handle CORS.

### Local Development

```bash
npm install
# Start the Airtable block dev server
block run
# In a separate terminal, start the local CORS proxy (uses blocks-cli's self-signed certs)
node proxy.js
```

The local proxy runs at `https://localhost:9005`. The production frontend uses the Vercel proxy at `exa-proxy.vercel.app` instead — to develop locally you'd need to swap `PROXY_URL` in `frontend/index.js`.

Requires `@airtable/blocks-cli` — see [Airtable Blocks CLI docs](https://airtable.com/developers/extensions/guides/hello-world-tutorial).

## How It Works

1. User enters a search query (e.g. "AI startups in healthcare")
2. The extension calls `POST /search` with `type: "deep"` and an `outputSchema` requesting structured company data
3. Results stream into a preview table inside the extension
4. User names the table and clicks "Create Table" to write records to the Airtable base (batched in groups of 50)

All requests include `x-exa-integration: airtable` header for usage tracking.

## License

MIT No Attribution — see [LICENSE.md](LICENSE.md)
