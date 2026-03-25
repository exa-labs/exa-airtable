import {
  initializeBlock,
  useBase,
  useGlobalConfig,
  Box,
  Text,
  Heading,
  Button,
  Input,
  Label,
  Loader,
  Link,
  Icon,
  SelectButtons,
  colors,
} from "@airtable/blocks/ui";
import { unstable_fetchAsync } from "@airtable/blocks";
import React, { useState, useCallback, useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Exa API
// ---------------------------------------------------------------------------

const EXA_API = "https://api.exa.ai";
const INTEGRATION = "airtable";
const BATCH_DELAY = 250;

function exaHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "x-exa-integration": INTEGRATION,
  };
}

async function exaFetch(method, endpoint, apiKey, body) {
  const hdrs = exaHeaders(apiKey);
  const requestJson = {
    method,
    url: `${EXA_API}${endpoint}`,
    headers: Object.entries(hdrs),
    body: body ? JSON.stringify(body) : null,
    redirect: "error",
    integrity: null,
  };
  const res = await unstable_fetchAsync(requestJson);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Exa ${endpoint} ${res.status}: ${res.body}`);
  }
  return JSON.parse(res.body);
}

function exaPost(endpoint, body, apiKey) {
  return exaFetch("POST", endpoint, apiKey, body);
}

function exaGet(endpoint, apiKey) {
  return exaFetch("GET", endpoint, apiKey);
}

function exaDelete(endpoint, apiKey) {
  return exaFetch("DELETE", endpoint, apiKey);
}

async function exaSearch(query, apiKey, opts = {}) {
  return exaPost(
    "/search",
    {
      query,
      numResults: opts.numResults ?? 5,
      type: opts.type ?? "auto",
      contents: { highlights: { maxCharacters: 4000 } },
      ...(opts.category && { category: opts.category }),
      ...(opts.outputSchema && { outputSchema: opts.outputSchema }),
      ...(opts.startPublishedDate && { startPublishedDate: opts.startPublishedDate }),
      ...(opts.includeDomains && { includeDomains: opts.includeDomains }),
    },
    apiKey,
  );
}

const SCHEMA_ITEMS = {
  company: {
    name: { type: "string" },
    website: { type: "string" },
    short_description: { type: "string" },
    category: { type: "string" },
    headquarters: { type: "string" },
    founded_year: { type: "number" },
    employee_count: { type: "number" },
    total_funding: { type: "string" },
  },
  news: {
    title: { type: "string" },
    source: { type: "string" },
    url: { type: "string" },
    published_date: { type: "string" },
    summary: { type: "string" },
  },
  "research paper": {
    title: { type: "string" },
    authors: { type: "string" },
    year: { type: "number" },
    url: { type: "string" },
    summary: { type: "string" },
  },
  tweet: {
    author: { type: "string" },
    handle: { type: "string" },
    content: { type: "string" },
    url: { type: "string" },
    date: { type: "string" },
  },
  none: {
    name: { type: "string" },
    url: { type: "string" },
    description: { type: "string" },
  },
};

function buildOutputSchema(categoryKey, count) {
  const props = SCHEMA_ITEMS[categoryKey] || SCHEMA_ITEMS.none;
  return {
    type: "object",
    properties: {
      results: {
        type: "array",
        description: `Return exactly ${count} distinct items. Do not merge or deduplicate.`,
        minItems: count,
        items: {
          type: "object",
          properties: props,
        },
      },
    },
  };
}

const TABLE_FIELDS = {
  company: [
    { name: "Name", type: "singleLineText", key: "name" },
    { name: "Short Description", type: "singleLineText", key: "short_description" },
    { name: "Category", type: "singleLineText", key: "category" },
    { name: "Website", type: "url", key: "website" },
    { name: "Headquarters", type: "singleLineText", key: "headquarters" },
    { name: "Founded", type: "number", key: "founded_year", options: { precision: 0 } },
    { name: "Employees", type: "number", key: "employee_count", options: { precision: 0 } },
    { name: "Funding", type: "singleLineText", key: "total_funding" },
  ],
  news: [
    { name: "Title", type: "singleLineText", key: "title" },
    { name: "Source", type: "singleLineText", key: "source" },
    { name: "URL", type: "url", key: "url" },
    { name: "Date", type: "singleLineText", key: "published_date" },
    { name: "Summary", type: "multilineText", key: "summary" },
  ],
  "research paper": [
    { name: "Title", type: "singleLineText", key: "title" },
    { name: "Authors", type: "singleLineText", key: "authors" },
    { name: "Year", type: "number", key: "year", options: { precision: 0 } },
    { name: "URL", type: "url", key: "url" },
    { name: "Summary", type: "multilineText", key: "summary" },
  ],
  tweet: [
    { name: "Author", type: "singleLineText", key: "author" },
    { name: "Handle", type: "singleLineText", key: "handle" },
    { name: "Content", type: "multilineText", key: "content" },
    { name: "URL", type: "url", key: "url" },
    { name: "Date", type: "singleLineText", key: "date" },
  ],
  none: [
    { name: "Name", type: "singleLineText", key: "name" },
    { name: "URL", type: "url", key: "url" },
    { name: "Description", type: "multilineText", key: "description" },
  ],
};

async function exaAnswer(query, apiKey, opts = {}) {
  return exaPost(
    "/answer",
    {
      query,
      type: opts.type ?? "deep",
    },
    apiKey,
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isoMonthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// API Key Setup
// ---------------------------------------------------------------------------

function ApiKeySetup({ onSave }) {
  const [key, setKey] = useState("");
  return (
    <Box padding={3} display="flex" flexDirection="column" alignItems="center">
      <Box marginBottom={3} display="flex" flexDirection="column" alignItems="center">
        <Heading size="large">⚡ Exa for Airtable</Heading>
        <Text textColor="light" marginTop={1}>
          Web intelligence for your base
        </Text>
      </Box>
      <Box padding={3} borderRadius="large" border="default" maxWidth="400px" width="100%">
        <Heading size="small" marginBottom={2}>
          Connect your API key
        </Heading>
        <Text marginBottom={2} textColor="light">
          Get a free key at{" "}
          <Link href="https://dashboard.exa.ai" target="_blank">
            dashboard.exa.ai
          </Link>
        </Text>
        <Input
          type="text"
          placeholder="exa-..."
          value={key}
          onChange={(e) => setKey(e.target.value)}
          marginBottom={2}
        />
        <Button
          variant="primary"
          onClick={() => onSave(key)}
          disabled={!key || key.length < 10}
          width="100%"
        >
          Save Key
        </Button>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Tool Card
// ---------------------------------------------------------------------------

function ToolCard({ icon, title, description, tag, onClick }) {
  return (
    <Box
      as="button"
      padding={2}
      marginBottom={2}
      borderRadius="large"
      border="default"
      width="100%"
      display="flex"
      alignItems="flex-start"
      onClick={onClick}
      style={{
        cursor: "pointer",
        background: "none",
        textAlign: "left",
        transition: "background 0.1s",
      }}
      className="tool-card"
    >
      <Text fontSize="24px" marginRight={2}>
        {icon}
      </Text>
      <Box flex={1}>
        <Box display="flex" alignItems="center">
          <Text fontWeight="600">{title}</Text>
          {tag && (
            <Box marginLeft={1} paddingX={1} borderRadius="default" backgroundColor="#FFF3CD">
              <Text fontSize="11px" textColor="#856404">
                {tag}
              </Text>
            </Box>
          )}
        </Box>
        <Text textColor="light" fontSize="12px" marginTop="2px">
          {description}
        </Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Progress Bar
// ---------------------------------------------------------------------------

function ProgressBar({ current, total, label }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <Box marginY={2}>
      <Box display="flex" justifyContent="space-between" marginBottom={1}>
        <Text fontSize="12px" textColor="light">
          {label}
        </Text>
        <Text fontSize="12px" textColor="light">
          {pct}%
        </Text>
      </Box>
      <Box
        height="6px"
        borderRadius="default"
        backgroundColor={colors.GRAY_LIGHT_2}
        overflow="hidden"
      >
        <Box
          height="100%"
          borderRadius="default"
          backgroundColor={colors.BLUE}
          style={{ width: `${pct}%`, transition: "width 0.3s" }}
        />
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Tool 1: Create a Web Table — /search deep → populate table
// ---------------------------------------------------------------------------

function CreateWebTable({ apiKey, onBack }) {
  const base = useBase();
  const [query, setQuery] = useState("");
  const [numResults, setNumResults] = useState(15);
  const [category, setCategory] = useState("company");
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState("input");
  const [tableName, setTableName] = useState("");
  const revealTimer = useRef(null);

  useEffect(() => {
    if ((phase !== "results" && phase !== "enriching") || !rows.length) return;
    if (visibleCount >= rows.length) {
      setVisibleCount(rows.length);
      return;
    }
    setVisibleCount(0);
    let i = 0;
    revealTimer.current = setInterval(() => {
      i += 1;
      setVisibleCount(i);
      if (i >= rows.length) clearInterval(revealTimer.current);
    }, 80);
    return () => clearInterval(revealTimer.current);
  }, [phase, rows.length]);

  const search = useCallback(async () => {
    setLoading(true);
    setEnriching(false);
    setError(null);
    setRows([]);
    setColumns([]);
    setVisibleCount(0);
    const schemaKey = category === "none" ? "none" : category;
    const fieldDefs = TABLE_FIELDS[schemaKey] || TABLE_FIELDS.none;
    setColumns(fieldDefs);
    setPhase("searching");

    try {
      // Phase 1: Fast search to get titles/URLs quickly
      const fastResult = await exaSearch(query, apiKey, {
        numResults,
        type: "auto",
        ...(category !== "none" && { category }),
      });

      const fastResults = fastResult.results || [];
      if (!fastResults.length) {
        setError("No results found. Try a different query.");
        setPhase("input");
        setColumns([]);
        setLoading(false);
        return;
      }

      // Build initial rows from fast results
      const initialRows = fastResults.map((r) => {
        const row = {};
        for (const col of fieldDefs) {
          row[col.key] = null;
        }
        // Fill what we know from the fast search
        if (row.hasOwnProperty("name")) row.name = r.title || "";
        if (row.hasOwnProperty("title")) row.title = r.title || "";
        if (row.hasOwnProperty("author")) row.author = r.author || "";
        if (row.hasOwnProperty("website")) row.website = r.url || "";
        if (row.hasOwnProperty("url")) row.url = r.url || "";
        if (row.hasOwnProperty("short_description") && r.highlights?.length) {
          row.short_description = r.highlights[0].slice(0, 200);
        }
        if (row.hasOwnProperty("summary") && r.highlights?.length) {
          row.summary = r.highlights[0].slice(0, 300);
        }
        if (row.hasOwnProperty("description") && r.highlights?.length) {
          row.description = r.highlights[0].slice(0, 300);
        }
        if (row.hasOwnProperty("content") && r.text) {
          row.content = r.text.slice(0, 280);
        }
        if (row.hasOwnProperty("source")) {
          try {
            row.source = new URL(r.url).hostname.replace("www.", "");
          } catch (_e) {
            row.source = "";
          }
        }
        if (row.hasOwnProperty("published_date") && r.publishedDate) {
          row.published_date = r.publishedDate.slice(0, 10);
        }
        if (row.hasOwnProperty("date") && r.publishedDate) {
          row.date = r.publishedDate.slice(0, 10);
        }
        return row;
      });

      setRows(initialRows);
      setPhase("enriching");
      setTableName(query.slice(0, 50));
      setLoading(false);
      setEnriching(true);

      // Phase 2: Deep search with outputSchema for enrichment
      const schema = buildOutputSchema(schemaKey, numResults);
      const deepResult = await exaSearch(query, apiKey, {
        numResults: Math.max(numResults * 2, 20),
        type: "deep",
        ...(category !== "none" && { category }),
        outputSchema: schema,
      });

      const content = deepResult.output?.content;
      let enrichedItems = [];
      if (Array.isArray(content?.results)) {
        enrichedItems = content.results;
      } else if (Array.isArray(content)) {
        enrichedItems = content;
      } else if (content && typeof content === "object") {
        const firstArray = Object.values(content).find(Array.isArray);
        if (firstArray) enrichedItems = firstArray;
      }

      if (enrichedItems.length) {
        setRows(enrichedItems);
        setVisibleCount(enrichedItems.length);
      }
      setPhase("results");
      setEnriching(false);
    } catch (err) {
      if (phase === "enriching" || rows.length > 0) {
        setPhase("results");
        setEnriching(false);
      } else {
        setError(err.message);
        setPhase("input");
        setColumns([]);
      }
    }
    setLoading(false);
  }, [query, numResults, category, apiKey]);

  const writeToBase = useCallback(async () => {
    if (!rows.length || !columns.length) return;
    setLoading(true);
    setError(null);

    try {
      const name = tableName || query.slice(0, 50);

      const airtableFields = columns.map((col) => {
        const def = { name: col.name, type: col.type };
        if (col.options) def.options = col.options;
        return def;
      });

      const newTable = await base.createTableAsync(name, airtableFields);

      const recordDefs = rows.map((row) => {
        const fields = {};
        for (const col of columns) {
          const val = row[col.key];
          if (val == null) continue;
          if (col.type === "number") {
            const num = typeof val === "number" ? val : parseFloat(val);
            if (!isNaN(num)) fields[col.name] = num;
          } else {
            fields[col.name] = String(val);
          }
        }
        return { fields };
      });

      for (let i = 0; i < recordDefs.length; i += 50) {
        await newTable.createRecordsAsync(recordDefs.slice(i, i + 50));
      }

      setPhase("done");
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [rows, columns, tableName, query, base]);

  return (
    <Box padding={3}>
      <Button icon="chevronLeft" variant="secondary" size="small" onClick={onBack} marginBottom={2}>
        Back
      </Button>

      <Heading size="small" marginBottom={1}>
        🌐 Create a Web Table
      </Heading>
      <Text textColor="light" marginBottom={2}>
        Exa will search the web to find companies and enrich them with leadership, headcount,
        funding, news, and more.
      </Text>

      <Label htmlFor="query-input">What are you looking for?</Label>
      <Input
        id="query-input"
        placeholder='e.g. "Top AI startups in San Francisco"'
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        marginBottom={2}
      />

      <Label htmlFor="category-select">Category filter</Label>
      <SelectButtons
        id="category-select"
        value={category}
        onChange={(v) => setCategory(v)}
        options={[
          { value: "company", label: "Companies" },
          { value: "news", label: "News" },
          { value: "research paper", label: "Research" },
          { value: "tweet", label: "Tweets" },
          { value: "none", label: "Any" },
        ]}
        marginBottom={2}
        width="100%"
      />

      <Label htmlFor="num-input">Number of results</Label>
      <Input
        id="num-input"
        type="number"
        value={String(numResults)}
        onChange={(e) => setNumResults(parseInt(e.target.value) || 10)}
        marginBottom={2}
        width="80px"
      />

      <Button
        variant="primary"
        onClick={search}
        disabled={!query.trim() || loading}
        marginBottom={2}
      >
        {loading ? <Loader scale={0.2} /> : "Search the Web"}
      </Button>

      {error && (
        <Box padding={2} borderRadius="default" backgroundColor="#FEE2E2" marginBottom={2}>
          <Text textColor="#991B1B">{error}</Text>
        </Box>
      )}

      {(phase === "searching" || phase === "enriching" || phase === "results") &&
        columns.length > 0 && (
          <Box marginTop={2}>
            {(phase === "results" || phase === "enriching") && rows.length > 0 && (
              <Heading size="xsmall" marginBottom={1}>
                Found {rows.length} results{enriching ? " — enriching..." : ""}
              </Heading>
            )}
            {phase === "searching" && (
              <Box display="flex" alignItems="center" marginBottom={1}>
                <Loader scale={0.3} />
                <Text marginLeft={2} textColor="light" fontSize="13px">
                  Searching the web with Exa...
                </Text>
              </Box>
            )}
            {enriching && (
              <Box display="flex" alignItems="center" marginBottom={1}>
                <Loader scale={0.3} />
                <Text marginLeft={2} textColor="light" fontSize="13px">
                  Enriching with deep search...
                </Text>
              </Box>
            )}

            <Box
              border="default"
              borderRadius="default"
              overflow="auto"
              maxHeight="400px"
              marginBottom={2}
              style={{ background: "#fff" }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "12px",
                  tableLayout: "auto",
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "2px solid #e0e0e0",
                      background: "#f5f5f5",
                      position: "sticky",
                      top: 0,
                      zIndex: 1,
                    }}
                  >
                    <th
                      style={{
                        padding: "8px 10px",
                        textAlign: "center",
                        width: "36px",
                        color: "#999",
                        fontWeight: "normal",
                        borderRight: "1px solid #e0e0e0",
                      }}
                    >
                      #
                    </th>
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        style={{
                          padding: "8px 10px",
                          textAlign: "left",
                          fontWeight: 600,
                          fontSize: "11px",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          color: "#444",
                          borderRight: "1px solid #eee",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {col.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {phase === "searching" &&
                    Array.from({ length: Math.min(numResults, 8) }).map((_, i) => (
                      <tr key={`skel-${i}`} style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <td
                          style={{
                            padding: "10px 10px",
                            textAlign: "center",
                            color: "#ccc",
                            borderRight: "1px solid #f0f0f0",
                          }}
                        >
                          {i + 1}
                        </td>
                        {columns.map((col) => (
                          <td key={col.key} style={{ padding: "10px" }}>
                            <Box
                              height="12px"
                              borderRadius="default"
                              backgroundColor={colors.GRAY_LIGHT_2}
                              style={{
                                width: `${50 + Math.random() * 40}%`,
                                animation: "pulse 1.5s ease-in-out infinite",
                                opacity: 1 - i * 0.08,
                              }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  {(phase === "results" || phase === "enriching") &&
                    rows.slice(0, visibleCount).map((row, i) => (
                      <tr
                        key={i}
                        style={{
                          borderBottom: "1px solid #f0f0f0",
                          background: i % 2 === 0 ? "#fff" : "#fafafa",
                          transition: "opacity 0.2s",
                        }}
                      >
                        <td
                          style={{
                            padding: "8px 10px",
                            textAlign: "center",
                            color: "#999",
                            fontSize: "11px",
                            borderRight: "1px solid #f0f0f0",
                          }}
                        >
                          {i + 1}
                        </td>
                        {columns.map((col) => (
                          <td
                            key={col.key}
                            style={{
                              padding: "8px 10px",
                              maxWidth: "200px",
                              borderRight: "1px solid #f0f0f0",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {col.type === "url" ? (
                              <Link
                                href={row[col.key]}
                                target="_blank"
                                style={{ fontSize: "12px" }}
                              >
                                {String(row[col.key] || "")
                                  .replace(/https?:\/\/(www\.)?/, "")
                                  .slice(0, 30)}
                              </Link>
                            ) : (
                              <Text fontSize="12px">
                                {String(row[col.key] ?? "").slice(0, 120)}
                              </Text>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </Box>

            {(phase === "results" || phase === "enriching") && visibleCount >= rows.length && (
              <Box display="flex" alignItems="center">
                <Input
                  placeholder="Table name"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  flex={1}
                  marginRight={1}
                />
                <Button variant="primary" onClick={writeToBase} disabled={loading}>
                  Create Table
                </Button>
              </Box>
            )}
          </Box>
        )}

      {phase === "done" && (
        <Box padding={2} borderRadius="default" backgroundColor="#D1FAE5" marginTop={2}>
          <Text textColor="#065F46">
            ✅ Created table &quot;{tableName}&quot; with {rows.length} records!
          </Text>
        </Box>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Tool 2: News Monitor — /search news category → fill News Updates table
// ---------------------------------------------------------------------------

// Monitors API helpers
async function createMonitor(query, numResults, apiKey, opts = {}) {
  const body = {
    name: opts.name || query.slice(0, 80),
    search: {
      query,
      numResults,
      contents: { text: { maxCharacters: 800 }, highlights: true },
    },
    webhook: { url: "https://httpbin.org/post" }, // placeholder, we poll instead
  };
  if (opts.cron) {
    body.trigger = {
      type: "cron",
      expression: opts.cron,
      timezone: opts.timezone || "America/Los_Angeles",
    };
  }
  return exaPost("/search-monitors", body, apiKey);
}

async function triggerMonitor(monitorId, apiKey) {
  return exaPost(`/search-monitors/${monitorId}/trigger`, {}, apiKey);
}

async function pollMonitorRun(monitorId, apiKey, maxWait = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const runs = await exaGet(`/search-monitors/${monitorId}/runs`, apiKey);
    if (runs.data?.length > 0) {
      const latest = runs.data[0];
      if (latest.status === "completed") {
        return await exaGet(`/search-monitors/${monitorId}/runs/${latest.id}`, apiKey);
      }
      if (latest.status === "failed") {
        throw new Error(`Monitor run failed: ${latest.error || "unknown"}`);
      }
    }
    await sleep(2000);
  }
  throw new Error("Monitor run timed out after 60s");
}

async function deleteMonitor(monitorId, apiKey) {
  return exaDelete(`/search-monitors/${monitorId}`, apiKey);
}

function NewsMonitor({ apiKey, onBack }) {
  const base = useBase();
  const [topics, setTopics] = useState("");
  const [numPerTopic, setNumPerTopic] = useState(5);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState("input");
  const [tableName, setTableName] = useState("");
  const [mode, setMode] = useState("once"); // 'once' or 'recurring'
  const [cronExpr, setCronExpr] = useState("0 9 * * *");
  const [createdMonitors, setCreatedMonitors] = useState([]);

  const searchNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResults([]);
    setPhase("input");

    const topicList = topics
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!topicList.length) {
      setError("Enter at least one topic/company name.");
      setLoading(false);
      return;
    }

    setProgress({ current: 0, total: topicList.length, label: "Creating monitors..." });
    const allResults = [];
    const monitors = [];

    try {
      for (let i = 0; i < topicList.length; i++) {
        const topic = topicList[i];
        setProgress({
          current: i + 1,
          total: topicList.length,
          label: `${topic} — creating monitor`,
        });

        // Create a monitor for this topic
        const monitor = await createMonitor(
          `${topic} latest news`,
          numPerTopic,
          apiKey,
          mode === "recurring"
            ? { cron: cronExpr, name: `News: ${topic}` }
            : { name: `News: ${topic}` },
        );
        monitors.push({ id: monitor.id, topic });

        // Trigger immediately and poll for results
        setProgress({ current: i + 1, total: topicList.length, label: `${topic} — searching...` });
        await triggerMonitor(monitor.id, apiKey);
        const run = await pollMonitorRun(monitor.id, apiKey);

        if (run.output?.results?.length > 0) {
          for (const r of run.output.results) {
            allResults.push({
              Topic: topic,
              Title: r.title || "",
              URL: r.url || "",
              Published: r.publishedDate || "",
              Highlight: r.highlights?.[0] || r.text?.slice(0, 200) || "",
            });
          }
        }

        // Clean up one-off monitors
        if (mode === "once") {
          await deleteMonitor(monitor.id, apiKey).catch(() => {});
        }

        await sleep(BATCH_DELAY);
      }

      if (mode === "recurring") {
        setCreatedMonitors(monitors);
      }

      setResults(allResults);
      setPhase("results");
      setTableName(`News ${new Date().toISOString().slice(0, 10)}`);
    } catch (err) {
      setError(err.message);
      if (allResults.length > 0) {
        setResults(allResults);
        setPhase("results");
        setTableName(`News ${new Date().toISOString().slice(0, 10)}`);
      }
      for (const m of monitors) {
        await deleteMonitor(m.id, apiKey).catch(() => {});
      }
    }
    setLoading(false);
  }, [topics, numPerTopic, apiKey, mode, cronExpr]);

  const writeToBase = useCallback(async () => {
    if (!results.length) return;
    setLoading(true);
    setError(null);

    try {
      const name = tableName || `News ${new Date().toISOString().slice(0, 10)}`;

      const fields = [
        { name: "Topic", type: "singleLineText" },
        { name: "Title", type: "singleLineText" },
        { name: "URL", type: "url" },
        { name: "Published", type: "singleLineText" },
        { name: "Highlight", type: "multilineText" },
      ];

      const newTable = await base.createTableAsync(name, fields);

      const recordDefs = results.map((row) => ({
        fields: {
          Topic: row.Topic || "",
          Title: row.Title || "",
          URL: row.URL || "",
          Published: row.Published || "",
          Highlight: row.Highlight || "",
        },
      }));

      for (let i = 0; i < recordDefs.length; i += 50) {
        await newTable.createRecordsAsync(recordDefs.slice(i, i + 50));
      }

      setPhase("done");
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [results, tableName, base]);

  return (
    <Box padding={3}>
      <Button icon="chevronLeft" variant="secondary" size="small" onClick={onBack} marginBottom={2}>
        Back
      </Button>

      <Heading size="small" marginBottom={1}>
        📰 News Monitor
      </Heading>
      <Text textColor="light" marginBottom={2}>
        Exa will search for recent news about your topics and populate a table.
      </Text>

      <Label htmlFor="topics-input">Topics / companies (one per line)</Label>
      <textarea
        id="topics-input"
        placeholder={"OpenAI\nAnthropic\nGoogle DeepMind"}
        value={topics}
        onChange={(e) => setTopics(e.target.value)}
        rows={4}
        style={{
          width: "100%",
          padding: "8px",
          borderRadius: "4px",
          border: "1px solid #ccc",
          fontFamily: "inherit",
          fontSize: "13px",
          marginBottom: "8px",
          resize: "vertical",
        }}
      />

      <Box display="flex" marginBottom={2}>
        <Box marginRight={2}>
          <Label htmlFor="num-per-topic">Results per topic</Label>
          <Input
            id="num-per-topic"
            type="number"
            value={String(numPerTopic)}
            onChange={(e) => setNumPerTopic(parseInt(e.target.value) || 5)}
            width="80px"
          />
        </Box>
      </Box>

      <Box marginBottom={2}>
        <Label>Mode</Label>
        <Box display="flex" marginTop={1}>
          <Button
            variant={mode === "once" ? "primary" : "secondary"}
            size="small"
            onClick={() => setMode("once")}
            marginRight={1}
          >
            One-time search
          </Button>
          <Button
            variant={mode === "recurring" ? "primary" : "secondary"}
            size="small"
            onClick={() => setMode("recurring")}
          >
            Recurring monitor
          </Button>
        </Box>
        {mode === "recurring" && (
          <Box marginTop={1}>
            <Label htmlFor="cron-input">Cron schedule</Label>
            <Input
              id="cron-input"
              placeholder="0 9 * * *"
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              width="200px"
            />
            <Text fontSize="11px" textColor="light" marginTop="2px">
              Default: daily at 9am PT. Uses standard cron syntax.
            </Text>
          </Box>
        )}
      </Box>

      <Button
        variant="primary"
        onClick={searchNews}
        disabled={!topics.trim() || loading}
        marginBottom={2}
      >
        {loading && phase === "input" ? <Loader scale={0.2} /> : "Search News"}
      </Button>

      {loading && progress.total > 0 && (
        <ProgressBar current={progress.current} total={progress.total} label={progress.label} />
      )}

      {error && (
        <Box padding={2} borderRadius="default" backgroundColor="#FEE2E2" marginBottom={2}>
          <Text textColor="#991B1B">{error}</Text>
        </Box>
      )}

      {phase === "results" && results.length > 0 && (
        <Box marginTop={2}>
          <Heading size="xsmall" marginBottom={1}>
            Found {results.length} articles
          </Heading>

          <Box
            border="default"
            borderRadius="default"
            overflow="auto"
            maxHeight="300px"
            marginBottom={2}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #ddd", background: "#f9f9f9" }}>
                  <th style={{ padding: "6px 8px", textAlign: "left" }}>Topic</th>
                  <th style={{ padding: "6px 8px", textAlign: "left" }}>Title</th>
                  <th style={{ padding: "6px 8px", textAlign: "left" }}>Published</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "6px 8px" }}>{row.Topic}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <Link href={row.URL} target="_blank" style={{ fontSize: "11px" }}>
                        {row.Title?.slice(0, 60)}
                      </Link>
                    </td>
                    <td style={{ padding: "6px 8px", fontSize: "11px" }}>
                      {row.Published?.slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>

          <Box display="flex" alignItems="center">
            <Input
              placeholder="Table name"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              flex={1}
              marginRight={1}
            />
            <Button variant="primary" onClick={writeToBase} disabled={loading}>
              Create Table
            </Button>
          </Box>
        </Box>
      )}

      {phase === "done" && (
        <Box padding={2} borderRadius="default" backgroundColor="#D1FAE5" marginTop={2}>
          <Text textColor="#065F46">
            ✅ Created table &quot;{tableName}&quot; with {results.length} records!
          </Text>
        </Box>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Tool 3: Generate Report — /answer deep
// ---------------------------------------------------------------------------

function GenerateReport({ apiKey, onBack }) {
  const [query, setQuery] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const result = await exaAnswer(query, apiKey, { type: "deep" });
      setReport({
        answer: result.answer,
        citations: result.citations || [],
      });
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [query, apiKey]);

  return (
    <Box padding={3}>
      <Button icon="chevronLeft" variant="secondary" size="small" onClick={onBack} marginBottom={2}>
        Back
      </Button>

      <Heading size="small" marginBottom={1}>
        📄 Generate a Report
      </Heading>
      <Text textColor="light" marginBottom={2}>
        Exa will search the web and write a long-form summary, analysis, or overview.
      </Text>

      <Input
        placeholder='e.g. "Competitive landscape of AI search engines in 2025"'
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        marginBottom={2}
      />

      <Button
        variant="primary"
        onClick={generate}
        disabled={!query.trim() || loading}
        marginBottom={2}
      >
        {loading ? <Loader scale={0.2} /> : "Generate Report"}
      </Button>

      {error && (
        <Box padding={2} borderRadius="default" backgroundColor="#FEE2E2" marginBottom={2}>
          <Text textColor="#991B1B">{error}</Text>
        </Box>
      )}

      {report && (
        <Box marginTop={2}>
          <Box padding={3} border="default" borderRadius="large" marginBottom={2}>
            <Text style={{ whiteSpace: "pre-wrap", lineHeight: "1.6" }}>{report.answer}</Text>
          </Box>

          {report.citations.length > 0 && (
            <Box>
              <Heading size="xsmall" marginBottom={1}>
                Sources ({report.citations.length})
              </Heading>
              {report.citations.map((c, i) => (
                <Box key={i} marginBottom={1}>
                  <Link href={c.url} target="_blank" fontSize="12px">
                    {c.title || c.url}
                  </Link>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

function ExaApp() {
  const globalConfig = useGlobalConfig();
  const [activeTool, setActiveTool] = useState(null);

  const apiKey = globalConfig.get("exaApiKey");

  const saveApiKey = useCallback(
    async (key) => {
      if (globalConfig.checkPermissionsForSet("exaApiKey").hasPermission) {
        await globalConfig.setAsync("exaApiKey", key);
      }
    },
    [globalConfig],
  );

  const clearApiKey = useCallback(async () => {
    if (globalConfig.checkPermissionsForSet("exaApiKey").hasPermission) {
      await globalConfig.setAsync("exaApiKey", "");
    }
    setActiveTool(null);
  }, [globalConfig]);

  if (!apiKey) {
    return <ApiKeySetup onSave={saveApiKey} />;
  }

  if (activeTool) {
    const tools = {
      webTable: CreateWebTable,
      news: NewsMonitor,
      report: GenerateReport,
    };
    const ToolComponent = tools[activeTool];
    return <ToolComponent apiKey={apiKey} onBack={() => setActiveTool(null)} />;
  }

  return (
    <Box padding={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" marginBottom={1}>
        <Heading>⚡ Exa</Heading>
        <Button
          variant="secondary"
          size="small"
          icon="cog"
          onClick={clearApiKey}
          aria-label="Settings"
        />
      </Box>
      <Text textColor="light" marginBottom={3}>
        Web intelligence for your base
      </Text>

      <ToolCard
        icon="🌐"
        title="Create a web table"
        tag="Exa Search"
        description="Search the web to find companies, people, or data and populate a new table."
        onClick={() => setActiveTool("webTable")}
      />
      <ToolCard
        icon="📰"
        title="News monitor"
        description="Find recent news articles about topics or companies and create a news table."
        onClick={() => setActiveTool("news")}
      />
      <ToolCard
        icon="📄"
        title="Generate a report"
        description="Research the web and write a long-form summary, analysis, or overview."
        onClick={() => setActiveTool("report")}
      />

      <Box marginTop={3} display="flex" justifyContent="center">
        <Text fontSize="11px" textColor="light">
          Powered by{" "}
          <Link href="https://exa.ai" target="_blank">
            Exa
          </Link>{" "}
          — the search engine for AI
        </Text>
      </Box>
    </Box>
  );
}

initializeBlock(() => <ExaApp />);
