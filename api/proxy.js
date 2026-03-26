export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, x-exa-integration");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // The Exa endpoint path comes as a query param: /api/proxy?path=/search
  const path = req.query.path;
  if (!path) {
    return res.status(400).json({ error: "Missing path query parameter" });
  }

  const targetUrl = `https://api.exa.ai${path}`;

  // Forward headers
  const headers = {
    "Content-Type": "application/json",
  };
  if (req.headers["x-api-key"]) headers["x-api-key"] = req.headers["x-api-key"];
  if (req.headers["x-exa-integration"]) headers["x-exa-integration"] = req.headers["x-exa-integration"];

  try {
    const fetchOpts = {
      method: req.method,
      headers,
    };
    if (req.body && req.method !== "GET") {
      fetchOpts.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOpts);
    const data = await response.text();

    res.status(response.status);
    // Forward content-type
    const ct = response.headers.get("content-type");
    if (ct) res.setHeader("Content-Type", ct);
    res.send(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
