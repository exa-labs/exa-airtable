const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EXA_API = 'https://api.exa.ai';
const PORT = 9005;

// Reuse the blocks-cli self-signed certs so the browser already trusts them
const blocksBin = require('child_process').execSync('which block', {encoding: 'utf8'}).trim();
const keysDir = path.join(path.dirname(blocksBin), '..', 'lib', 'node_modules', '@airtable', 'blocks-cli', 'keys');
const key = fs.readFileSync(path.join(keysDir, 'server.key'));
const cert = fs.readFileSync(path.join(keysDir, 'server.crt'));

const server = https.createServer({key, cert}, (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-exa-integration');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Strip /proxy prefix
    const targetPath = req.url.replace(/^\/proxy/, '');
    const targetUrl = new URL(targetPath, EXA_API);

    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
        const body = chunks.length > 0 ? Buffer.concat(chunks) : null;

        const headers = {...req.headers, host: targetUrl.host};
        delete headers['origin'];
        delete headers['referer'];

        const proxyReq = https.request(
            targetUrl,
            {method: req.method, headers},
            proxyRes => {
                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                proxyRes.pipe(res);
            },
        );

        proxyReq.on('error', err => {
            res.writeHead(502);
            res.end(JSON.stringify({error: err.message}));
        });

        if (body) proxyReq.write(body);
        proxyReq.end();
    });
});

server.listen(PORT, () => {
    console.log(`CORS proxy running at https://localhost:${PORT}`);
});
