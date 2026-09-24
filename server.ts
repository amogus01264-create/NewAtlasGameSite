import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json());

  // API: Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API: Test whether a URL has X-Frame-Options or frame-ancestors CSP
  app.get('/api/check-frameable', async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    try {
      const response = await fetch(targetUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      const xfo = response.headers.get('x-frame-options');
      const csp = response.headers.get('content-security-policy') || '';
      const hasFrameAncestors = csp.includes('frame-ancestors');

      const isRestricted = !!xfo || hasFrameAncestors;

      res.json({
        url: targetUrl,
        isFrameable: !isRestricted,
        xfo: xfo || null,
        hasFrameAncestors,
        suggestedMode: isRestricted ? 'proxy' : 'direct',
      });
    } catch {
      // If HEAD fails, fallback to suggesting proxy
      res.json({
        url: targetUrl,
        isFrameable: false,
        suggestedMode: 'proxy',
      });
    }
  });

  // API: Reverse Proxy that strips X-Frame-Options and Content-Security-Policy
  app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
      return res.status(400).send('Invalid or missing target URL.');
    }

    try {
      const parsedUrl = new URL(targetUrl);
      const origin = parsedUrl.origin;

      const upstreamRes = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      const contentType = upstreamRes.headers.get('content-type') || 'text/html';

      // Remove framing restrictions
      res.removeHeader('X-Frame-Options');
      res.removeHeader('Content-Security-Policy');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', contentType);

      if (contentType.includes('text/html')) {
        let html = await upstreamRes.text();

        // Inject <base href="..."> into <head> so relative links, images, styles, and scripts load from the origin
        const baseTag = `<base href="${targetUrl}">`;
        // Inject anti-framebuster patch
        const frameBusterPatch = `
          <script>
            try {
              if (window.top !== window.self) {
                // Neutralize top navigation locks
                window.onbeforeunload = null;
              }
            } catch(e) {}
          </script>
        `;

        if (html.includes('<head>')) {
          html = html.replace('<head>', `<head>${baseTag}${frameBusterPatch}`);
        } else if (html.includes('<HEAD>')) {
          html = html.replace('<HEAD>', `<HEAD>${baseTag}${frameBusterPatch}`);
        } else {
          html = `${baseTag}${frameBusterPatch}${html}`;
        }

        return res.send(html);
      }

      // For non-HTML (e.g. scripts, images, audio, canvas assets)
      const buffer = Buffer.from(await upstreamRes.arrayBuffer());
      return res.send(buffer);
    } catch (err: any) {
      console.error('Proxy fetch error:', err);
      return res.status(500).send(`
        <div style="font-family: sans-serif; background: #0b0f19; color: #fff; padding: 30px; text-align: center; height: 100vh; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: center;">
          <h2 style="color: #ff4d4f; margin-bottom: 10px;">Connection Refused by Destination Site</h2>
          <p style="color: #94a3b8; max-width: 500px; font-size: 14px; line-height: 1.6;">
            This website (${encodeURIComponent(targetUrl)}) prevented direct server proxy fetching or requires strict local cookies.
          </p>
          <div style="margin-top: 20px;">
            <a href="${targetUrl}" target="_blank" rel="noopener noreferrer" style="background: #00A2FF; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 13px;">
              Launch in Cloaked / Clean Tab
            </a>
          </div>
        </div>
      `);
    }
  });

  // Mount Vite middleware in development or serve static in production
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
