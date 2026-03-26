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

// ---------------------------------------------------------------------------
// Enrichment definitions
// ---------------------------------------------------------------------------

const ENRICHMENTS = {
  company: [
    { key: "short_description", label: "Short Description", type: "string", default: true },
    { key: "category", label: "Category", type: "string", default: true },
    { key: "headquarters", label: "Headquarters", type: "string", default: true },
    { key: "founded_year", label: "Founded", type: "number", default: true },
    { key: "employee_count", label: "Employee Count", type: "number", default: true },
    { key: "total_funding", label: "Funding", type: "string", default: true },
    { key: "revenue", label: "Revenue", type: "string", default: false },
    { key: "ceo", label: "CEO", type: "string", default: false },
    { key: "linkedin_url", label: "LinkedIn URL", type: "string", default: false },
    { key: "industry", label: "Industry", type: "string", default: false },
  ],
  news: [
    { key: "source", label: "Source", type: "string", default: true },
    { key: "published_date", label: "Date", type: "string", default: true },
    { key: "summary", label: "Summary", type: "string", default: true },
    { key: "author_name", label: "Author", type: "string", default: false },
    { key: "sentiment", label: "Sentiment", type: "string", default: false },
  ],
  "research paper": [
    { key: "authors", label: "Authors", type: "string", default: true },
    { key: "year", label: "Year", type: "number", default: true },
    { key: "summary", label: "Summary", type: "string", default: true },
    { key: "journal", label: "Journal", type: "string", default: false },
    { key: "citation_count", label: "Citations", type: "number", default: false },
  ],
  tweet: [
    { key: "handle", label: "Handle", type: "string", default: true },
    { key: "content", label: "Content", type: "string", default: true },
    { key: "date", label: "Date", type: "string", default: true },
    { key: "likes", label: "Likes", type: "number", default: false },
    { key: "retweets", label: "Retweets", type: "number", default: false },
  ],
  none: [
    { key: "description", label: "Description", type: "string", default: true },
    { key: "summary", label: "Summary", type: "string", default: false },
  ],
};

const BASE_COLUMNS = {
  company: [
    { name: "Name", type: "singleLineText", key: "name" },
    { name: "Website", type: "url", key: "website" },
  ],
  news: [
    { name: "Title", type: "singleLineText", key: "title" },
    { name: "URL", type: "url", key: "url" },
  ],
  "research paper": [
    { name: "Title", type: "singleLineText", key: "title" },
    { name: "URL", type: "url", key: "url" },
  ],
  tweet: [
    { name: "Author", type: "singleLineText", key: "author" },
    { name: "URL", type: "url", key: "url" },
  ],
  none: [
    { name: "Name", type: "singleLineText", key: "name" },
    { name: "URL", type: "url", key: "url" },
  ],
};

function buildColumnsFromEnrichments(catKey, selectedKeys, customFields) {
  const base = BASE_COLUMNS[catKey] || BASE_COLUMNS.none;
  const enrichments = ENRICHMENTS[catKey] || ENRICHMENTS.none;
  const enrichCols = enrichments
    .filter((e) => selectedKeys.includes(e.key))
    .map((e) => ({
      name: e.label,
      type: e.type === "number" ? "number" : e.type === "url" ? "url" : "singleLineText",
      key: e.key,
      ...(e.type === "number" ? { options: { precision: 0 } } : {}),
    }));
  const customCols = (customFields || []).map((cf) => ({
    name: cf,
    type: "singleLineText",
    key: cf.toLowerCase().replace(/\s+/g, "_"),
  }));
  return [...base, ...enrichCols, ...customCols];
}

function buildSchemaFromEnrichments(catKey, selectedKeys, customFields, count) {
  const enrichments = ENRICHMENTS[catKey] || ENRICHMENTS.none;
  const base = BASE_COLUMNS[catKey] || BASE_COLUMNS.none;
  const props = {};
  for (const col of base) {
    props[col.key] = { type: "string" };
  }
  for (const e of enrichments) {
    if (selectedKeys.includes(e.key)) {
      props[e.key] = { type: e.type === "number" ? "number" : "string" };
    }
  }
  for (const cf of customFields || []) {
    const cfKey = cf.toLowerCase().replace(/\s+/g, "_");
    props[cfKey] = { type: "string" };
  }
  return {
    type: "object",
    properties: {
      results: {
        type: "array",
        description: `Return exactly ${count} distinct items. Do not merge or deduplicate.`,
        minItems: count,
        items: { type: "object", properties: props },
      },
    },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// API Key Setup
// ---------------------------------------------------------------------------

function ApiKeySetup({ onSave }) {
  const [key, setKey] = useState("");
  return (
    <Box padding={3} display="flex" flexDirection="column" alignItems="center">
      <Box marginBottom={3} display="flex" flexDirection="column" alignItems="center">
        <Heading size="large">Exa for Airtable</Heading>
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
// Enrichment Pill Selector
// ---------------------------------------------------------------------------

function EnrichmentPills({
  category,
  selected,
  onChange,
  customFields,
  onAddCustom,
  onRemoveCustom,
}) {
  const enrichments = ENRICHMENTS[category] || ENRICHMENTS.none;
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const toggle = (key) => {
    if (selected.includes(key)) {
      onChange(selected.filter((k) => k !== key));
    } else {
      onChange([...selected, key]);
    }
  };

  const addCustom = () => {
    const trimmed = customValue.trim();
    if (trimmed && !customFields.includes(trimmed)) {
      onAddCustom(trimmed);
    }
    setCustomValue("");
    setShowCustomInput(false);
  };

  return (
    <Box
      marginBottom={2}
      padding={2}
      border="default"
      borderRadius="default"
      style={{ background: "#fafafa" }}
    >
      <Box display="flex" justifyContent="space-between" alignItems="center" marginBottom={1}>
        <Text fontWeight="600" fontSize="13px">
          Enrichments
        </Text>
        <Text fontSize="11px" textColor="light">
          {selected.length + customFields.length} / row
        </Text>
      </Box>

      <Box display="flex" flexWrap="wrap" style={{ gap: "6px" }}>
        {enrichments.map((e) => {
          const isSelected = selected.includes(e.key);
          return (
            <Box
              key={e.key}
              as="button"
              onClick={() => toggle(e.key)}
              paddingX={1}
              paddingY="2px"
              borderRadius="default"
              style={{
                border: isSelected ? "2px solid #2D7FF9" : "1px solid #ddd",
                background: isSelected ? "#EBF3FE" : "#fff",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "12px",
                color: isSelected ? "#2D7FF9" : "#333",
                fontWeight: isSelected ? 500 : 400,
                fontFamily: "inherit",
                lineHeight: "20px",
              }}
            >
              {e.label}
              {isSelected && (
                <span style={{ fontSize: "10px", marginLeft: "2px" }}>{"\u00d7"}</span>
              )}
            </Box>
          );
        })}

        {customFields.map((cf) => (
          <Box
            key={`custom-${cf}`}
            as="button"
            onClick={() => onRemoveCustom(cf)}
            paddingX={1}
            paddingY="2px"
            borderRadius="default"
            style={{
              border: "2px solid #8B5CF6",
              background: "#F3EEFF",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "12px",
              color: "#8B5CF6",
              fontWeight: 500,
              fontFamily: "inherit",
              lineHeight: "20px",
            }}
          >
            {cf}
            <span style={{ fontSize: "10px", marginLeft: "2px" }}>{"\u00d7"}</span>
          </Box>
        ))}

        {showCustomInput ? (
          <Box display="flex" alignItems="center" style={{ gap: "4px" }}>
            <input
              autoFocus
              placeholder="Field name"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addCustom();
                if (e.key === "Escape") {
                  setShowCustomInput(false);
                  setCustomValue("");
                }
              }}
              style={{
                border: "1px solid #ddd",
                borderRadius: "3px",
                padding: "2px 6px",
                fontSize: "12px",
                width: "100px",
                fontFamily: "inherit",
                outline: "none",
              }}
            />
            <Box
              as="button"
              onClick={addCustom}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: "14px",
                color: "#2D7FF9",
                padding: "0 2px",
                fontFamily: "inherit",
              }}
            >
              +
            </Box>
          </Box>
        ) : (
          <Box
            as="button"
            onClick={() => setShowCustomInput(true)}
            paddingX={1}
            paddingY="2px"
            borderRadius="default"
            style={{
              border: "1px dashed #ccc",
              background: "#fff",
              cursor: "pointer",
              fontSize: "12px",
              color: "#666",
              fontFamily: "inherit",
              lineHeight: "20px",
            }}
          >
            + Custom
          </Box>
        )}
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Create a Web Table
// ---------------------------------------------------------------------------

function CreateWebTable({ apiKey, onSettings }) {
  const base = useBase();
  const [query, setQuery] = useState("");
  const [numResults, setNumResults] = useState(15);
  const [category, setCategory] = useState("company");
  const [selectedEnrichments, setSelectedEnrichments] = useState(() =>
    ENRICHMENTS.company.filter((e) => e.default).map((e) => e.key),
  );
  const [customFields, setCustomFields] = useState([]);
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
    const catKey = category === "none" ? "none" : category;
    const defaults = (ENRICHMENTS[catKey] || ENRICHMENTS.none)
      .filter((e) => e.default)
      .map((e) => e.key);
    setSelectedEnrichments(defaults);
    setCustomFields([]);
  }, [category]);

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

  const addCustomField = useCallback((name) => {
    setCustomFields((prev) => [...prev, name]);
  }, []);

  const removeCustomField = useCallback((name) => {
    setCustomFields((prev) => prev.filter((f) => f !== name));
  }, []);

  const search = useCallback(async () => {
    setLoading(true);
    setEnriching(false);
    setError(null);
    setRows([]);
    setColumns([]);
    setVisibleCount(0);
    const catKey = category === "none" ? "none" : category;
    const fieldDefs = buildColumnsFromEnrichments(catKey, selectedEnrichments, customFields);
    setColumns(fieldDefs);
    setPhase("searching");
    let localPhase = "searching";
    let hasPhase1Results = false;

    try {
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

      const initialRows = fastResults.map((r) => {
        const row = {};
        for (const col of fieldDefs) {
          row[col.key] = null;
        }
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
        if (row.hasOwnProperty("content") && (r.text || r.highlights?.length)) {
          row.content = (r.text || r.highlights[0]).slice(0, 280);
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
      localPhase = "enriching";
      hasPhase1Results = true;
      setTableName(query.slice(0, 50));
      setLoading(false);
      setEnriching(true);

      const entityNames = fastResults
        .map((r) => (r.title || "").replace(/\s*[-|\u2013\u2014].*/g, "").trim())
        .filter(Boolean);
      const domains = [];
      for (const r of fastResults) {
        try {
          const host = new URL(r.url).hostname.replace("www.", "");
          if (host && !domains.includes(host)) domains.push(host);
        } catch (_e) {
          /* skip bad URLs */
        }
      }
      const deepQuery =
        entityNames.length > 0
          ? `${query}. Focus on these specific entities: ${entityNames.join(", ")}`
          : query;
      const schema = buildSchemaFromEnrichments(
        catKey,
        selectedEnrichments,
        customFields,
        numResults,
      );
      const deepResult = await exaSearch(deepQuery, apiKey, {
        numResults: Math.max(numResults * 2, 20),
        type: "deep",
        ...(category !== "none" && { category }),
        ...(domains.length > 0 && { includeDomains: domains }),
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
      if (localPhase === "enriching" || hasPhase1Results) {
        setPhase("results");
        setEnriching(false);
      } else {
        setError(err.message);
        setPhase("input");
        setColumns([]);
      }
    }
    setLoading(false);
  }, [query, numResults, category, apiKey, selectedEnrichments, customFields]);

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
      <Box display="flex" justifyContent="space-between" alignItems="center" marginBottom={1}>
        <Heading size="small">Create a Web Table</Heading>
        <Button
          variant="secondary"
          size="small"
          icon="cog"
          onClick={onSettings}
          aria-label="Settings"
        />
      </Box>
      <Text textColor="light" marginBottom={2}>
        Search the web to find companies, people, or data and populate a new table.
      </Text>

      <Label htmlFor="query-input">What are you looking for?</Label>
      <Input
        id="query-input"
        placeholder='e.g. "Top AI startups in San Francisco"'
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        marginBottom={2}
      />

      <Label htmlFor="category-select">Category</Label>
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

      <EnrichmentPills
        category={category === "none" ? "none" : category}
        selected={selectedEnrichments}
        onChange={setSelectedEnrichments}
        customFields={customFields}
        onAddCustom={addCustomField}
        onRemoveCustom={removeCustomField}
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
        width="100%"
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
                Found {rows.length} results{enriching ? " \u2014 enriching..." : ""}
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
                  Enriching with details...
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
            Created table &quot;{tableName}&quot; with {rows.length} records!
          </Text>
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
  }, [globalConfig]);

  if (!apiKey) {
    return <ApiKeySetup onSave={saveApiKey} />;
  }

  return <CreateWebTable apiKey={apiKey} onSettings={clearApiKey} />;
}

initializeBlock(() => <ExaApp />);
