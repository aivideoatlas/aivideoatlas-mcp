# AI Video Atlas MCP server

Give your AI agent a video director. This is the open-source MCP server (and REST API) behind [AI Video Atlas](https://aivideoatlas.com). It lets Claude, ChatGPT, Cursor, Gemini, Grok Bot or any MCP client plan AI video shots, pick models, find sourced prompts, and price a clip using vendor-stated $/second, all from Atlas data.

- **Live endpoint:** `https://mcp.aivideoatlas.com/mcp` (streamable HTTP, no auth, free)
- **REST API:** `https://mcp.aivideoatlas.com/v1/<tool>`. The OpenAPI spec is at `https://mcp.aivideoatlas.com/openapi.json`.
- **Agent guide:** https://aivideoatlas.com/agents/

It's read-only and deterministic: no AI generation happens on the server, and every answer is built from Atlas's sourced data, with links back to the original creators and vendor pages.

## Connect

**Claude (web and desktop):** open [claude.ai → Settings → Connectors](https://claude.ai/settings/connectors), click **Add custom connector**, name it **AI Video Atlas** and paste `https://mcp.aivideoatlas.com/mcp`. No sign-in is needed. On Team and Enterprise plans, an owner may need to add the connector first.
Claude Code:
```
claude mcp add --transport http ai-video-atlas https://mcp.aivideoatlas.com/mcp
```

**ChatGPT:** custom MCP connectors need **developer mode**, a beta for paid plans (Pro, Business, Enterprise, Edu). It isn't available on Free. Open **Settings → Apps & Connectors → Advanced settings** and turn on Developer mode. Then click **Create**, name it **AI Video Atlas**, paste the URL and set authentication to **No authentication**.
Building a custom GPT instead? Go to **Configure → Actions → Import from URL** and use `https://mcp.aivideoatlas.com/openapi.json`.

**Cursor:** use the one-click "Add to Cursor" button on https://aivideoatlas.com/agents/, or add this to `~/.cursor/mcp.json`:
```json
{"mcpServers":{"ai-video-atlas":{"url":"https://mcp.aivideoatlas.com/mcp"}}}
```

**Gemini:** Gemini CLI (free):
```
gemini mcp add --transport http ai-video-atlas https://mcp.aivideoatlas.com/mcp
```
In the Gemini app, custom connected apps are limited to Gemini Spark on personal Google accounts in the US (18+). If you have it, add a custom app with the URL above. Gems can't connect to outside tools.

**Grok Bot:** paste this into your Grok Bot chat:
```
Add this MCP server: name aivideoatlas, URL https://mcp.aivideoatlas.com/mcp (no key needed).
```
Grok Bot confirms before adding it, and the tools are available from your next message.

**Any MCP client / API:** use the URL above (streamable HTTP, no auth). For plain HTTP:
```
curl "https://mcp.aivideoatlas.com/v1/find_shot?query=drone+shot&limit=3"
```
VS Code, Windsurf and other MCP clients take the same URL.

## Tools

| Tool | What it does |
|---|---|
| `plan_shots` | Plan a multi-shot video from a plain description: splits it into beats and picks a sourced shot, model, prompt and estimated cost for each. Deterministic, built only from Atlas data. |
| `find_shot` | Search the library of sourced AI video shots (real prompts creators posted, with the model, estimated cost and a link to the original). |
| `best_prompt` | Get the full sourced prompt that best matches a shot, optionally for a target model, with creator credit and source. |
| `recommend_model` | Recommend a model for a shot with evidence: how many sourced shots used each model, the cheapest vendor-stated $/s, and an estimated total. |
| `get_prices` | Vendor-stated $/second prices with source URL and check date. Filter by family or host. Discontinued rows are excluded unless asked for. |
| `get_workflow` | How-to workflows, tools and model guides grouped by job (lip-sync, upscaling, character consistency and more). |
| `get_guide` | Per-model prompting guidance (structure, camera, modes, consistency, audio, what to avoid, limits), sourced from vendor docs plus proven Atlas examples. |
| `whats_new` | The newest shots and guides added in the last N days. |

The server also exposes MCP resources (for example, `atlas://guides/<model>`) and server instructions that tell agents when to use each tool.

## Rate limits

The public instance is free and keyless. It allows about **60 requests a minute per client** (per IPv4 address, or per IPv6 /48), enforced by a Durable Object. A backup edge rule also applies. Over the limit, you get HTTP 429 with `retry-after`.

## Privacy

- No accounts, keys or cookies.
- **IP addresses are never stored or logged.** They're used only in memory to apply the rate limit.
- Workers invocation logs are off. The only log line is an anonymous `atlas_query` event: tool name, query text (lowercased and truncated), argument names, result count, latency and client name, if the client sends one. These are used to see which tools and topics are useful.
- Don't put personal information in queries.

## Run your own copy

```
npm install
npm run build            # downloads the public data export from https://aivideoatlas.com/agent-data.json and inlines it
npx wrangler dev         # local
npx wrangler deploy      # needs your own Cloudflare account
```

`npm run build` writes `dist/worker.mjs`. To build from a local export instead, run `node scripts/build.mjs --data=path/to/agent-data.json`, or place it at `data/agent-data.json` (gitignored).

In `wrangler.toml`, set `account_id` (or use `CLOUDFLARE_ACCOUNT_ID`) and, optionally, your own custom-domain route. The Durable Object binding `LIMITER` → `RateLimiter` (SQLite-backed, available on the free plan) is already declared. No secrets are required.

## Data and licensing

The code is MIT-licensed (see `LICENSE`). The data is not in this repo: it's AI Video Atlas's public export, with credit to the original creators and vendor sources linked on every item. Please keep those credits when you show results.

## Registry

`server.json` is the entry for the official MCP Registry (`com.aivideoatlas/atlas`).

Contact: hello@aivideoatlas.com
