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

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // API: Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // High-Capacity Server-Side Storage Registry for Streams and Users
  interface ServerStream {
    id: string;
    streamer: string;
    streamerPic: string;
    title: string;
    gameTitle: string;
    visibility: 'public' | 'friends';
    status: 'live' | 'ended';
    startedAt: string;
    viewerCount: number;
    previewFrame?: string;
    lastPing?: number;
  }

  const serverStreamsMap = new Map<string, ServerStream>();

  // Cleanup stale streams after 30 seconds of inactivity
  setInterval(() => {
    const now = Date.now();
    for (const [id, s] of serverStreamsMap.entries()) {
      if (s.lastPing && now - s.lastPing > 30000 && s.status === 'live') {
        s.status = 'ended';
      }
    }
  }, 10000);

  // API: Get high-capacity active streams
  app.get('/api/storage/streams', (_req, res) => {
    const active = Array.from(serverStreamsMap.values()).filter((s) => s.status === 'live');
    res.json(active);
  });

  // API: Register or update stream on server
  app.post('/api/storage/streams', (req, res) => {
    const stream = req.body as ServerStream;
    if (!stream || !stream.id) {
      return res.status(400).json({ error: 'Missing stream id' });
    }
    stream.lastPing = Date.now();
    serverStreamsMap.set(stream.id, stream);
    res.json({ success: true, stream });
  });

  // API: Update live preview snapshot
  app.post('/api/storage/streams/:id/snapshot', (req, res) => {
    const { id } = req.params;
    const { previewFrame } = req.body;
    const s = serverStreamsMap.get(id);
    if (s) {
      s.previewFrame = previewFrame;
      s.lastPing = Date.now();
    }
    res.json({ success: true });
  });

  // API: End stream on server (DELETE and POST for navigator.sendBeacon)
  const handleEndStream = (req: express.Request, res: express.Response) => {
    const { id } = req.params;
    const s = serverStreamsMap.get(id);
    if (s) {
      s.status = 'ended';
      // Auto-prune ended stream from memory after 30 seconds
      setTimeout(() => serverStreamsMap.delete(id), 30000);
    }
    res.json({ success: true });
  };
  app.delete('/api/storage/streams/:id', handleEndStream);
  app.post('/api/storage/streams/:id/end', handleEndStream);

  // API: Stream keep-alive ping
  app.post('/api/storage/streams/:id/ping', (req, res) => {
    const { id } = req.params;
    const s = serverStreamsMap.get(id);
    if (s) {
      s.lastPing = Date.now();
    }
    res.json({ success: true, timestamp: Date.now() });
  });

  // Server-side stream chat store
  interface ServerChatMessage {
    id: string;
    streamId: string;
    sender: string;
    senderPic?: string;
    text: string;
    timestamp: string;
  }
  const serverStreamMessagesMap = new Map<string, ServerChatMessage[]>();

  // API: Get stream chat messages
  app.get('/api/storage/streams/:id/messages', (req, res) => {
    const { id } = req.params;
    const msgs = serverStreamMessagesMap.get(id) || [];
    res.json(msgs);
  });

  // API: Post stream chat message
  app.post('/api/storage/streams/:id/messages', (req, res) => {
    const { id } = req.params;
    const msg = req.body as ServerChatMessage;
    if (!msg || !msg.text) {
      return res.status(400).json({ error: 'Invalid message' });
    }
    const current = serverStreamMessagesMap.get(id) || [];
    current.push(msg);
    // Keep only last 200 messages
    if (current.length > 200) {
      current.splice(0, current.length - 200);
    }
    serverStreamMessagesMap.set(id, current);
    res.json({ success: true, message: msg });
  });

  // API: Storage capacity & health status
  app.get('/api/storage/health', (_req, res) => {
    res.json({
      status: 'ok',
      activeStreams: Array.from(serverStreamsMap.values()).filter((s) => s.status === 'live').length,
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    });
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
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).send('Invalid or missing target URL.');
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return res.status(400).send('Only HTTP and HTTPS URLs are supported.');
      }
    } catch {
      return res.status(400).send('Malformed target URL.');
    }

    try {
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

  // Global Error Handler to safeguard server process against any unhandled payload errors
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Server gracefully caught error:', err?.message || err);
    if (!res.headersSent) {
      res.status(err?.status || 500).json({ error: err?.message || 'Server error' });
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
