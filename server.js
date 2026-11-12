import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Databricks Apps sets DATABRICKS_APP_PORT (usually 8000/8080), Cloud Run sets PORT, default 3000
const port = Number(process.env.DATABRICKS_APP_PORT || process.env.PORT || 3000);
const host = '0.0.0.0';

app.use(express.json({ limit: '10mb' }));

// Serve static assets from dist folder
app.use(express.static(path.join(__dirname, 'dist')));

// Health check endpoint for Databricks Apps & Cloud Run
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

// Proxy endpoint for Databricks SQL Statements REST API (bypasses browser CORS)
app.post('/api/databricks/execute-sql', async (req, res) => {
  try {
    const { workspaceUrl, token, statement, warehouse_id, catalog, schema, wait_timeout, on_wait_timeout } = req.body;
    if (!workspaceUrl || !token || !statement || !warehouse_id) {
      return res.status(400).json({ error: 'Missing required Databricks parameters' });
    }

    const cleanedUrl = workspaceUrl.replace(/\/+$/, '');
    const apiUrl = `${cleanedUrl}/api/2.0/sql/statements`;

    const fetchRes = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        statement,
        warehouse_id,
        catalog: catalog || undefined,
        schema: schema || undefined,
        wait_timeout: wait_timeout || '30s',
        on_wait_timeout: on_wait_timeout || 'CONTINUE',
      }),
    });

    const responseText = await fetchRes.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    res.status(fetchRes.status).json(data);
  } catch (err) {
    console.error('Databricks proxy error:', err);
    res.status(500).json({ error: err.message || 'Internal server error calling Databricks' });
  }
});

// SPA fallback: serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`);
});
