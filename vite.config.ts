import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    server: {
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      setupMiddlewares(middlewares: any) {
        middlewares.use('/api/databricks/execute-sql', async (req: any, res: any) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const { workspaceUrl, token, statement, warehouse_id, catalog, schema, wait_timeout, on_wait_timeout } = JSON.parse(body || '{}');
              if (!workspaceUrl || !token || !statement || !warehouse_id) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Missing required Databricks parameters' }));
                return;
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
              res.statusCode = fetchRes.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(responseText);
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || 'Internal proxy error' }));
            }
          });
        });
        return middlewares;
      },
    },
    preview: {
      allowedHosts: true as const,
      host: '0.0.0.0',
      port: 3000,
    },
  };
});
