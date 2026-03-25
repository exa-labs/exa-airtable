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
    colors,
} from '@airtable/blocks/ui';
import {unstable_fetchAsync} from '@airtable/blocks';
import React, {useState, useCallback} from 'react';

// ---------------------------------------------------------------------------
// Exa API
// ---------------------------------------------------------------------------

const EXA_API = 'https://api.exa.ai';
const INTEGRATION = 'airtable';

function exaHeaders(apiKey) {
    return {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'x-exa-integration': INTEGRATION,
    };
}

const PROXY_URL = 'https://localhost:9005';

async function exaFetch(method, endpoint, apiKey, body) {
    const url = `${PROXY_URL}/proxy${endpoint}`;
    const opts = {method, headers: exaHeaders(apiKey)};
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Exa ${endpoint} ${res.status}: ${text}`);
    }
    return res.json();
}

function exaPost(endpoint, body, apiKey) {
    return exaFetch('POST', endpoint, apiKey, body);
}

function exaGet(endpoint, apiKey) {
    return exaFetch('GET', endpoint, apiKey);
}

function exaDelete(endpoint, apiKey) {
    return exaFetch('DELETE', endpoint, apiKey);
}

async function exaSearch(query, apiKey, opts = {}) {
    const body = {
        query,
        numResults: opts.numResults ?? 5,
        type: opts.type ?? 'auto',
        contents: {text: {maxCharacters: 1200}, highlights: true},
        ...(opts.category && {category: opts.category}),
        ...(opts.startPublishedDate && {startPublishedDate: opts.startPublishedDate}),
        ...(opts.includeDomains && {includeDomains: opts.includeDomains}),
    };
    if (opts.outputSchema) {
        body.outputSchema = opts.outputSchema;
    }
    return exaPost('/search', body, apiKey);
}

async function exaAnswer(query, apiKey, opts = {}) {
    return exaPost('/answer', {
        query,
        type: opts.type ?? 'deep',
    }, apiKey);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isoMonthsAgo(n) {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// API Key Setup
// ---------------------------------------------------------------------------

function ApiKeySetup({onSave}) {
    const [key, setKey] = useState('');
    return (
        <Box padding={3} display="flex" flexDirection="column" alignItems="center">
            <Box marginBottom={3} display="flex" flexDirection="column" alignItems="center">
                <Heading size="large">⚡ Exa for Airtable</Heading>
                <Text textColor="light" marginTop={1}>Web intelligence for your base</Text>
            </Box>
            <Box
                padding={3}
                borderRadius="large"
                border="default"
                maxWidth="400px"
                width="100%"
            >
                <Heading size="small" marginBottom={2}>Connect your API key</Heading>
                <Text marginBottom={2} textColor="light">
                    Get a free key at{' '}
                    <Link href="https://dashboard.exa.ai" target="_blank">dashboard.exa.ai</Link>
                </Text>
                <Input
                    type="text"
                    placeholder="exa-..."
                    value={key}
                    onChange={e => setKey(e.target.value)}
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

function ToolCard({icon, title, description, tag, onClick}) {
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
                cursor: 'pointer',
                background: 'none',
                textAlign: 'left',
                transition: 'background 0.1s',
            }}
            className="tool-card"
        >
            <Text fontSize="24px" marginRight={2}>{icon}</Text>
            <Box flex={1}>
                <Box display="flex" alignItems="center">
                    <Text fontWeight="600">{title}</Text>
                    {tag && (
                        <Box
                            marginLeft={1}
                            paddingX={1}
                            borderRadius="default"
                            backgroundColor="#FFF3CD"
                        >
                            <Text fontSize="11px" textColor="#856404">{tag}</Text>
                        </Box>
                    )}
                </Box>
                <Text textColor="light" fontSize="12px" marginTop="2px">{description}</Text>
            </Box>
        </Box>
    );
}

// ---------------------------------------------------------------------------
// Progress Bar
// ---------------------------------------------------------------------------

function ProgressBar({current, total, label}) {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    return (
        <Box marginY={2}>
            <Box display="flex" justifyContent="space-between" marginBottom={1}>
                <Text fontSize="12px" textColor="light">{label}</Text>
                <Text fontSize="12px" textColor="light">{pct}%</Text>
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
                    style={{width: `${pct}%`, transition: 'width 0.3s'}}
                />
            </Box>
        </Box>
    );
}

// ---------------------------------------------------------------------------
// Toggle Switch
// ---------------------------------------------------------------------------

function ToggleSwitch({checked, onChange}) {
    return (
        <Box
            as="button"
            onClick={onChange}
            style={{
                width: '40px',
                height: '22px',
                borderRadius: '11px',
                border: 'none',
                padding: '2px',
                cursor: 'pointer',
                background: checked ? '#2d7ff9' : '#ccc',
                transition: 'background 0.2s',
                display: 'flex',
                alignItems: 'center',
            }}
        >
            <Box
                style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: 'white',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    transition: 'transform 0.2s',
                    transform: checked ? 'translateX(18px)' : 'translateX(0)',
                }}
            />
        </Box>
    );
}

// ---------------------------------------------------------------------------
// Tool 1: Create a Web Table — /search deep → populate table
// ---------------------------------------------------------------------------

function CreateWebTable({apiKey, onBack}) {
    const base = useBase();
    const [query, setQuery] = useState('');
    const [numResults, setNumResults] = useState(10);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState({current: 0, total: 0, label: ''});
    const [error, setError] = useState(null);
    const [phase, setPhase] = useState('input');
    const [tableName, setTableName] = useState('');

    const search = useCallback(async () => {
        setLoading(true);
        setError(null);
        setRows([]);
        setPhase('input');
        setProgress({current: 0, total: 0, label: 'Searching the web with Exa...'});

        try {
            const outputSchema = {
                type: 'object',
                properties: {
                    entities: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: {type: 'string', description: 'Company or entity name'},
                                website: {type: 'string', description: 'Primary website URL'},
                                description: {type: 'string', description: 'Brief description of what the company does and when it was founded'},
                                headquarters: {type: 'string', description: 'HQ city and country, e.g. "San Francisco, CA, USA"'},
                                headcount: {type: 'string', description: 'Approximate employee count or range, e.g. "500-1000" or "~2000"'},
                                leadership: {type: 'string', description: 'CEO / key leaders, e.g. "CEO: Jane Doe, CTO: John Smith"'},
                                funding: {type: 'string', description: 'Latest funding info, e.g. "Series B, $50M" or "Public (NYSE: XYZ)"'},
                                recentNews: {type: 'string', description: 'One-sentence summary of the most recent notable news or announcement'},
                                industry: {type: 'string', description: 'Primary industry or sector, e.g. "AI / Machine Learning"'},
                            },
                        },
                    },
                },
            };

            const searchResult = await exaSearch(query, apiKey, {
                numResults: numResults * 2,
                type: 'deep',
                outputSchema,
            });

            const allEntities = searchResult.output?.content?.entities;
            const entities = allEntities?.slice(0, numResults);

            if (!entities?.length) {
                setError('No results found. Try a different query.');
                setLoading(false);
                return;
            }

            setProgress({current: 0, total: entities.length, label: 'Processing results...'});

            const enrichedRows = [];
            for (let i = 0; i < entities.length; i++) {
                const e = entities[i];
                setProgress({
                    current: i + 1,
                    total: entities.length,
                    label: e.name || '',
                });

                enrichedRows.push({
                    Name: e.name || '',
                    Website: e.website || '',
                    Description: e.description || '',
                    Headquarters: e.headquarters || '',
                    Headcount: e.headcount || '',
                    Leadership: e.leadership || '',
                    Funding: e.funding || '',
                    'Recent News': e.recentNews || '',
                    Industry: e.industry || '',
                });
                await sleep(50);
            }

            setRows(enrichedRows);
            setPhase('results');
            setTableName(query.slice(0, 50));
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    }, [query, numResults, apiKey]);

    const writeToBase = useCallback(async () => {
        if (!rows.length) return;
        setLoading(true);
        setError(null);

        try {
            const name = tableName || query.slice(0, 50);

            const fields = [
                {name: 'Name', type: 'singleLineText'},
                {name: 'Website', type: 'url'},
                {name: 'Description', type: 'multilineText'},
                {name: 'Headquarters', type: 'singleLineText'},
                {name: 'Headcount', type: 'singleLineText'},
                {name: 'Leadership', type: 'singleLineText'},
                {name: 'Funding', type: 'singleLineText'},
                {name: 'Recent News', type: 'multilineText'},
                {name: 'Industry', type: 'singleLineText'},
            ];

            const newTable = await base.createTableAsync(name, fields);

            const recordDefs = rows.map(row => ({
                fields: {
                    Name: row.Name || '',
                    Website: row.Website || '',
                    Description: row.Description || '',
                    Headquarters: row.Headquarters || '',
                    Headcount: row.Headcount || '',
                    Leadership: row.Leadership || '',
                    Funding: row.Funding || '',
                    'Recent News': row['Recent News'] || '',
                    Industry: row.Industry || '',
                },
            }));

            for (let i = 0; i < recordDefs.length; i += 50) {
                await newTable.createRecordsAsync(recordDefs.slice(i, i + 50));
            }

            setPhase('done');
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    }, [rows, tableName, query, base]);

    return (
        <Box padding={3}>
            <Button
                icon="chevronLeft"
                variant="secondary"
                size="small"
                onClick={onBack}
                marginBottom={2}
            >
                Back
            </Button>

            <Heading size="small" marginBottom={1}>🌐 Create a Web Table</Heading>
            <Text textColor="light" marginBottom={2}>
                Exa will search the web to find companies and enrich them with leadership, headcount, funding, news, and more.
            </Text>

            <Label htmlFor="query-input">What companies are you looking for?</Label>
            <Input
                id="query-input"
                placeholder='e.g. "Top AI startups in San Francisco" or "Series B fintech companies"'
                value={query}
                onChange={e => setQuery(e.target.value)}
                marginBottom={2}
            />

            <Label htmlFor="num-input">Number of results</Label>
            <Input
                id="num-input"
                type="number"
                value={String(numResults)}
                onChange={e => setNumResults(parseInt(e.target.value) || 10)}
                marginBottom={2}
                width="80px"
            />

            <Button
                variant="primary"
                onClick={search}
                disabled={!query.trim() || loading}
                marginBottom={2}
            >
                {loading && phase === 'input' ? <Loader scale={0.2} /> : 'Search the Web'}
            </Button>

            {loading && progress.total > 0 && (
                <ProgressBar
                    current={progress.current}
                    total={progress.total}
                    label={progress.label}
                />
            )}

            {error && (
                <Box
                    padding={2}
                    borderRadius="default"
                    backgroundColor="#FEE2E2"
                    marginBottom={2}
                >
                    <Text textColor="#991B1B">{error}</Text>
                </Box>
            )}

            {phase === 'results' && rows.length > 0 && (
                <Box marginTop={2}>
                    <Heading size="xsmall" marginBottom={1}>
                        Found {rows.length} results
                    </Heading>

                    <Box
                        border="default"
                        borderRadius="default"
                        overflow="auto"
                        maxHeight="300px"
                        marginBottom={2}
                    >
                        <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '12px'}}>
                            <thead>
                                <tr style={{borderBottom: '1px solid #ddd', background: '#f9f9f9'}}>
                                    <th style={{padding: '6px 8px', textAlign: 'left'}}>Name</th>
                                    <th style={{padding: '6px 8px', textAlign: 'left'}}>Website</th>
                                    <th style={{padding: '6px 8px', textAlign: 'left'}}>Industry</th>
                                    <th style={{padding: '6px 8px', textAlign: 'left'}}>HQ</th>
                                    <th style={{padding: '6px 8px', textAlign: 'left'}}>Headcount</th>
                                    <th style={{padding: '6px 8px', textAlign: 'left'}}>Leadership</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, i) => (
                                    <tr key={i} style={{borderBottom: '1px solid #eee'}}>
                                        <td style={{padding: '6px 8px', fontWeight: 500}}>{row.Name}</td>
                                        <td style={{padding: '6px 8px'}}>
                                            <Link href={row.Website} target="_blank" style={{fontSize: '11px'}}>
                                                {row.Website?.replace(/https?:\/\/(www\.)?/, '').slice(0, 25)}
                                            </Link>
                                        </td>
                                        <td style={{padding: '6px 8px'}}>
                                            <Text fontSize="11px">{row.Industry}</Text>
                                        </td>
                                        <td style={{padding: '6px 8px'}}>
                                            <Text fontSize="11px">{row.Headquarters}</Text>
                                        </td>
                                        <td style={{padding: '6px 8px'}}>
                                            <Text fontSize="11px">{row.Headcount}</Text>
                                        </td>
                                        <td style={{padding: '6px 8px', maxWidth: '150px'}}>
                                            <Text fontSize="11px">{row.Leadership?.slice(0, 60)}</Text>
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
                            onChange={e => setTableName(e.target.value)}
                            flex={1}
                            marginRight={1}
                        />
                        <Button
                            variant="primary"
                            onClick={writeToBase}
                            disabled={loading}
                        >
                            Create Table
                        </Button>
                    </Box>
                </Box>
            )}

            {phase === 'done' && (
                <Box
                    padding={2}
                    borderRadius="default"
                    backgroundColor="#D1FAE5"
                    marginTop={2}
                >
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
            contents: {text: {maxCharacters: 800}, highlights: true},
        },
        webhook: {url: 'https://httpbin.org/post'}, // placeholder, we poll instead
    };
    if (opts.cron) {
        body.trigger = {
            type: 'cron',
            expression: opts.cron,
            timezone: opts.timezone || 'America/Los_Angeles',
        };
    }
    return exaPost('/monitors', body, apiKey);
}

async function triggerMonitor(monitorId, apiKey) {
    return exaPost(`/monitors/${monitorId}/trigger`, {}, apiKey);
}

async function pollMonitorRun(monitorId, apiKey, maxWait = 60000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
        const runs = await exaGet(`/monitors/${monitorId}/runs`, apiKey);
        if (runs.data?.length > 0) {
            const latest = runs.data[0];
            if (latest.status === 'completed') {
                return await exaGet(
                    `/monitors/${monitorId}/runs/${latest.id}`,
                    apiKey
                );
            }
            if (latest.status === 'failed') {
                throw new Error(`Monitor run failed: ${latest.error || 'unknown'}`);
            }
        }
        await sleep(2000);
    }
    throw new Error('Monitor run timed out after 60s');
}

async function deleteMonitor(monitorId, apiKey) {
    return exaDelete(`/monitors/${monitorId}`, apiKey);
}

function NewsMonitor({apiKey, onBack}) {
    const base = useBase();
    const [topics, setTopics] = useState('');
    const [numPerTopic, setNumPerTopic] = useState(5);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState({current: 0, total: 0, label: ''});
    const [error, setError] = useState(null);
    const [phase, setPhase] = useState('input');
    const [tableName, setTableName] = useState('');
    const [mode, setMode] = useState('once'); // 'once' or 'recurring'
    const [cronExpr, setCronExpr] = useState('0 9 * * *');
    const [createdMonitors, setCreatedMonitors] = useState([]);

    const searchNews = useCallback(async () => {
        setLoading(true);
        setError(null);
        setResults([]);
        setPhase('input');

        const topicList = topics.split('\n').map(t => t.trim()).filter(Boolean);
        if (!topicList.length) {
            setError('Enter at least one topic/company name.');
            setLoading(false);
            return;
        }

        setProgress({current: 0, total: topicList.length, label: 'Creating monitors...'});
        const monitors = [];

        try {
            // Create all monitors in parallel
            const monitorPromises = topicList.map(topic =>
                createMonitor(
                    `${topic} latest news`,
                    numPerTopic,
                    apiKey,
                    mode === 'recurring' ? {cron: cronExpr, name: `News: ${topic}`} : {name: `News: ${topic}`},
                ).then(monitor => ({id: monitor.id, topic})),
            );
            const createdMonitors = await Promise.all(monitorPromises);
            monitors.push(...createdMonitors);

            // Trigger all monitors in parallel
            setProgress({current: 0, total: topicList.length, label: 'Searching all topics...'});
            await Promise.all(monitors.map(m => triggerMonitor(m.id, apiKey)));

            // Poll all monitors in parallel
            let completed = 0;
            const runPromises = monitors.map(async (m) => {
                const run = await pollMonitorRun(m.id, apiKey);
                completed++;
                setProgress({current: completed, total: monitors.length, label: `${m.topic} — done`});
                return {topic: m.topic, run};
            });
            const runResults = await Promise.all(runPromises);

            // Collect all results
            const allResults = [];
            for (const {topic, run} of runResults) {
                if (run.output?.results?.length > 0) {
                    for (const r of run.output.results) {
                        allResults.push({
                            Topic: topic,
                            Title: r.title || '',
                            URL: r.url || '',
                            Published: r.publishedDate || '',
                            Highlight: r.highlights?.[0] || r.text?.slice(0, 200) || '',
                        });
                    }
                }
            }

            // Clean up one-off monitors in parallel
            if (mode === 'once') {
                await Promise.all(monitors.map(m => deleteMonitor(m.id, apiKey).catch(() => {})));
            }

            if (mode === 'recurring') {
                setCreatedMonitors(monitors);
            }

            setResults(allResults);
            setPhase('results');
            setTableName(`News ${new Date().toISOString().slice(0, 10)}`);
        } catch (err) {
            setError(err.message);
            // Clean up on error
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
                {name: 'Topic', type: 'singleLineText'},
                {name: 'Title', type: 'singleLineText'},
                {name: 'URL', type: 'url'},
                {name: 'Published', type: 'singleLineText'},
                {name: 'Highlight', type: 'multilineText'},
            ];

            const newTable = await base.createTableAsync(name, fields);

            const recordDefs = results.map(row => ({
                fields: {
                    Topic: row.Topic || '',
                    Title: row.Title || '',
                    URL: row.URL || '',
                    Published: row.Published || '',
                    Highlight: row.Highlight || '',
                },
            }));

            for (let i = 0; i < recordDefs.length; i += 50) {
                await newTable.createRecordsAsync(recordDefs.slice(i, i + 50));
            }

            setPhase('done');
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    }, [results, tableName, base]);

    return (
        <Box padding={3}>
            <Button
                icon="chevronLeft"
                variant="secondary"
                size="small"
                onClick={onBack}
                marginBottom={2}
            >
                Back
            </Button>

            <Heading size="small" marginBottom={1}>📰 News Monitor</Heading>
            <Text textColor="light" marginBottom={2}>
                Exa will search for recent news about your topics and populate a table.
            </Text>

            <Label htmlFor="topics-input">
                Topics / companies (one per line)
            </Label>
            <textarea
                id="topics-input"
                placeholder={'OpenAI\nAnthropic\nGoogle DeepMind'}
                value={topics}
                onChange={e => setTopics(e.target.value)}
                rows={4}
                style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    fontFamily: 'inherit',
                    fontSize: '13px',
                    marginBottom: '8px',
                    resize: 'vertical',
                }}
            />

            <Box display="flex" marginBottom={2}>
                <Box marginRight={2}>
                    <Label htmlFor="num-per-topic">Results per topic</Label>
                    <Input
                        id="num-per-topic"
                        type="number"
                        value={String(numPerTopic)}
                        onChange={e => setNumPerTopic(parseInt(e.target.value) || 5)}
                        width="80px"
                    />
                </Box>
            </Box>

            <Box
                marginBottom={2}
                padding={2}
                borderRadius="default"
                border="default"
            >
                <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box>
                        <Text fontWeight="600" fontSize="13px">Recurring monitor</Text>
                        <Text fontSize="11px" textColor="light">
                            Automatically re-run on a schedule
                        </Text>
                    </Box>
                    <ToggleSwitch
                        checked={mode === 'recurring'}
                        onChange={() => setMode(mode === 'recurring' ? 'once' : 'recurring')}
                    />
                </Box>
                {mode === 'recurring' && (
                    <Box marginTop={2}>
                        <Label htmlFor="cron-input">Schedule</Label>
                        <Box display="flex" alignItems="center" marginTop={1}>
                            <select
                                id="cron-input"
                                value={cronExpr}
                                onChange={e => setCronExpr(e.target.value)}
                                style={{
                                    padding: '6px 8px',
                                    borderRadius: '4px',
                                    border: '1px solid #ccc',
                                    fontFamily: 'inherit',
                                    fontSize: '13px',
                                    background: 'white',
                                }}
                            >
                                <option value="0 9 * * *">Daily at 9am</option>
                                <option value="0 9 * * 1">Weekly (Monday 9am)</option>
                                <option value="0 9 1 * *">Monthly (1st at 9am)</option>
                                <option value="0 */6 * * *">Every 6 hours</option>
                            </select>
                            <Text fontSize="11px" textColor="light" marginLeft={1}>
                                Pacific Time
                            </Text>
                        </Box>
                    </Box>
                )}
            </Box>

            <Button
                variant="primary"
                onClick={searchNews}
                disabled={!topics.trim() || loading}
                marginBottom={2}
            >
                {loading && phase === 'input' ? <Loader scale={0.2} /> : 'Search News'}
            </Button>

            {loading && progress.total > 0 && (
                <ProgressBar
                    current={progress.current}
                    total={progress.total}
                    label={progress.label}
                />
            )}

            {error && (
                <Box padding={2} borderRadius="default" backgroundColor="#FEE2E2" marginBottom={2}>
                    <Text textColor="#991B1B">{error}</Text>
                </Box>
            )}

            {phase === 'results' && results.length > 0 && (
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
                        <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '12px'}}>
                            <thead>
                                <tr style={{borderBottom: '1px solid #ddd', background: '#f9f9f9'}}>
                                    <th style={{padding: '6px 8px', textAlign: 'left'}}>Topic</th>
                                    <th style={{padding: '6px 8px', textAlign: 'left'}}>Title</th>
                                    <th style={{padding: '6px 8px', textAlign: 'left'}}>Published</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((row, i) => (
                                    <tr key={i} style={{borderBottom: '1px solid #eee'}}>
                                        <td style={{padding: '6px 8px'}}>{row.Topic}</td>
                                        <td style={{padding: '6px 8px'}}>
                                            <Link href={row.URL} target="_blank" style={{fontSize: '11px'}}>
                                                {row.Title?.slice(0, 60)}
                                            </Link>
                                        </td>
                                        <td style={{padding: '6px 8px', fontSize: '11px'}}>
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
                            onChange={e => setTableName(e.target.value)}
                            flex={1}
                            marginRight={1}
                        />
                        <Button variant="primary" onClick={writeToBase} disabled={loading}>
                            Create Table
                        </Button>
                    </Box>
                </Box>
            )}

            {phase === 'done' && (
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

function GenerateReport({apiKey, onBack}) {
    const [query, setQuery] = useState('');
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const generate = useCallback(async () => {
        setLoading(true);
        setError(null);
        setReport(null);
        try {
            const result = await exaAnswer(query, apiKey, {type: 'deep'});
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
            <Button
                icon="chevronLeft"
                variant="secondary"
                size="small"
                onClick={onBack}
                marginBottom={2}
            >
                Back
            </Button>

            <Heading size="small" marginBottom={1}>📄 Generate a Report</Heading>
            <Text textColor="light" marginBottom={2}>
                Exa will search the web and write a long-form summary, analysis, or overview.
            </Text>

            <Input
                placeholder='e.g. "Competitive landscape of AI search engines in 2025"'
                value={query}
                onChange={e => setQuery(e.target.value)}
                marginBottom={2}
            />

            <Button
                variant="primary"
                onClick={generate}
                disabled={!query.trim() || loading}
                marginBottom={2}
            >
                {loading ? <Loader scale={0.2} /> : 'Generate Report'}
            </Button>

            {error && (
                <Box padding={2} borderRadius="default" backgroundColor="#FEE2E2" marginBottom={2}>
                    <Text textColor="#991B1B">{error}</Text>
                </Box>
            )}

            {report && (
                <Box marginTop={2}>
                    <Box
                        padding={3}
                        border="default"
                        borderRadius="large"
                        marginBottom={2}
                    >
                        <Text style={{whiteSpace: 'pre-wrap', lineHeight: '1.6'}}>
                            {report.answer}
                        </Text>
                    </Box>

                    {report.citations.length > 0 && (
                        <Box>
                            <Heading size="xsmall" marginBottom={1}>
                                Sources ({report.citations.length})
                            </Heading>
                            {report.citations.map((c, i) => (
                                <Box key={i} marginBottom={1}>
                                    <Link
                                        href={c.url}
                                        target="_blank"
                                        fontSize="12px"
                                    >
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

    const apiKey = globalConfig.get('exaApiKey');

    const saveApiKey = useCallback(async (key) => {
        if (globalConfig.checkPermissionsForSet('exaApiKey').hasPermission) {
            await globalConfig.setAsync('exaApiKey', key);
        }
    }, [globalConfig]);

    const clearApiKey = useCallback(async () => {
        if (globalConfig.checkPermissionsForSet('exaApiKey').hasPermission) {
            await globalConfig.setAsync('exaApiKey', '');
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
                onClick={() => setActiveTool('webTable')}
            />
            <ToolCard
                icon="📰"
                title="News monitor"
                description="Find recent news articles about topics or companies and create a news table."
                onClick={() => setActiveTool('news')}
            />
            <ToolCard
                icon="📄"
                title="Generate a report"
                description="Research the web and write a long-form summary, analysis, or overview."
                onClick={() => setActiveTool('report')}
            />

            <Box marginTop={3} display="flex" justifyContent="center">
                <Text fontSize="11px" textColor="light">
                    Powered by{' '}
                    <Link href="https://exa.ai" target="_blank">Exa</Link>
                    {' '}— the search engine for AI
                </Text>
            </Box>
        </Box>
    );
}

initializeBlock(() => <ExaApp />);
