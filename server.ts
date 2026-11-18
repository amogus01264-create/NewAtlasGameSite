import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import crypto from 'crypto';

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

  // API: High-Performance Reverse Proxy with Streaming & Caching
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
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 12000);

      const upstreamRes = await fetch(targetUrl, {
        signal: abortController.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      clearTimeout(timeoutId);

      const contentType = upstreamRes.headers.get('content-type') || 'text/html';

      // Remove framing restrictions
      res.removeHeader('X-Frame-Options');
      res.removeHeader('Content-Security-Policy');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Content-Type', contentType);

      // Pass along performance & range headers if present
      const contentLength = upstreamRes.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      const etag = upstreamRes.headers.get('etag');
      if (etag) res.setHeader('ETag', etag);
      res.setHeader('Accept-Ranges', 'bytes');

      if (contentType.includes('text/html')) {
        // Cache HTML for 30 minutes, allowing background revalidation
        res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=86400');
        let html = await upstreamRes.text();

        // Inject <base href="..."> into <head> so relative links, images, styles, and scripts load from the origin
        const baseTag = `<base href="${targetUrl}">`;
        // Inject anti-framebuster patch
        const frameBusterPatch = `
          <script>
            try {
              if (window.top !== window.self) {
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

      // High-performance caching for non-HTML game assets (wasm, js, png, mp3, css, etc.)
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800, immutable');

      // Stream binary body directly using Node Readable stream for lowest latency
      if (upstreamRes.body) {
        // @ts-ignore: Readable.fromWeb supports web ReadableStream
        const nodeStream = Readable.fromWeb(upstreamRes.body as any);
        nodeStream.pipe(res);
      } else {
        const buffer = Buffer.from(await upstreamRes.arrayBuffer());
        return res.send(buffer);
      }
    } catch (err: any) {
      if (res.headersSent) return;
      console.error('Proxy fetch error:', err?.message || err);
      return res.status(500).send(`
        <div style="font-family: sans-serif; background: #0b0f19; color: #fff; padding: 30px; text-align: center; height: 100vh; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: center;">
          <h2 style="color: #ff4d4f; margin-bottom: 10px;">Connection Refused or Timed Out</h2>
          <p style="color: #94a3b8; max-width: 500px; font-size: 14px; line-height: 1.6;">
            This website (${encodeURIComponent(targetUrl)}) took too long or restricted direct proxy framing.
          </p>
          <div style="margin-top: 20px; display: flex; gap: 10px;">
            <a href="${targetUrl}" target="_blank" rel="noopener noreferrer" style="background: #00A2FF; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 13px;">
              Launch Direct in New Tab
            </a>
          </div>
        </div>
      `);
    }
  });

  // ============================================================================
  // THE BINDING OF ISAAC (APPID 250900) LOCKED STEAM WORKSHOP & MOD CATALOGUE
  // ============================================================================
  const ISAAC_APP_ID = 250900;
  const ISAAC_MOD_BUDGET_BYTES = 96 * 1024 * 1024; // 96 MiB browser loader cap
  const ISAAC_CACHE_DIR = path.join(os.tmpdir(), 'isaac-mods-cache');
  const ISAAC_INDEX_FILE = path.join(ISAAC_CACHE_DIR, 'index.json');

  interface CachedIsaacMod {
    id: string;
    name: string;
    description: string;
    previewUrl: string;
    bytes: number;
    fileSize: number;
    subscriptions: number;
    tags: string[];
    addedAt: string;
    zipPath: string;
  }

  try {
    fs.mkdirSync(ISAAC_CACHE_DIR, { recursive: true });
  } catch {}

  function zipHasRealFiles(buffer: Buffer): boolean {
    if (buffer.length < 22 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) return false;
    let eocd = -1;
    for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
      if (buffer.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return false;
    const count = buffer.readUInt16LE(eocd + 10);
    let p = buffer.readUInt32LE(eocd + 16);
    for (let i = 0; i < count && p + 46 <= buffer.length; i++) {
      if (buffer.readUInt32LE(p) !== 0x02014b50) break;
      const nlen = buffer.readUInt16LE(p + 28);
      const elen = buffer.readUInt16LE(p + 30);
      const clen = buffer.readUInt16LE(p + 32);
      const name = buffer.subarray(p + 46, p + 46 + nlen).toString('utf8');
      if (name && !name.endsWith('/')) return true;
      p += 46 + nlen + elen + clen;
    }
    return false;
  }

  const cachedIsaacModsMap = new Map<string, CachedIsaacMod>();
  let prunedInvalidCache = false;
  try {
    if (fs.existsSync(ISAAC_INDEX_FILE)) {
      const savedList: CachedIsaacMod[] = JSON.parse(fs.readFileSync(ISAAC_INDEX_FILE, 'utf-8'));
      if (Array.isArray(savedList)) {
        for (const m of savedList) {
          if (m?.id && m?.zipPath && fs.existsSync(m.zipPath)) {
            const buf = fs.readFileSync(m.zipPath);
            if (zipHasRealFiles(buf)) {
              cachedIsaacModsMap.set(m.id, m);
            } else {
              prunedInvalidCache = true;
              try {
                fs.unlinkSync(m.zipPath);
              } catch {}
            }
          }
        }
      }
    }
  } catch {}

  const persistIsaacIndex = () => {
    try {
      fs.writeFileSync(ISAAC_INDEX_FILE, JSON.stringify(Array.from(cachedIsaacModsMap.values()), null, 2));
    } catch {}
  };
  if (prunedInvalidCache) {
    persistIsaacIndex();
  }

  async function fetchSteamPublishedDetails(ids: string[]) {
    if (!ids.length) return [];
    const body = new URLSearchParams({ itemcount: String(ids.length) });
    ids.forEach((id, i) => body.append(`publishedfileids[${i}]`, id));

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    try {
      const resp = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
        method: 'POST',
        signal: ac.signal,
        body,
      });
      const data: any = await resp.json();
      return Array.isArray(data?.response?.publishedfiledetails) ? data.response.publishedfiledetails : [];
    } finally {
      clearTimeout(timer);
    }
  }

  function cleanSteamBbCode(text: string): string {
    return (text || '')
      .replace(/\[img\][\s\S]*?\[\/img\]/gi, '')
      .replace(/\[url=[^\]]*\]([\s\S]*?)\[\/url\]/gi, '$1')
      .replace(/\[\/?[a-z0-9=*#]+\]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Strictly searches Steam Workshop ONLY for AppID 250900 (Binding of Isaac)
  app.get('/api/isaac/workshop/search', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const sortParam = typeof req.query.sort === 'string' ? req.query.sort : 'totaluniquesubscribers';
    const tagParam = typeof req.query.tag === 'string' ? req.query.tag.trim() : '';
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);

    const allowedSorts: Record<string, string> = {
      totaluniquesubscribers: 'totaluniquesubscribers',
      trend: 'trend',
      mostrecent: 'mostrecent',
      toprated: 'toprated',
      textsearch: 'textsearch',
    };
    const sort = allowedSorts[sortParam] || (q ? 'textsearch' : 'totaluniquesubscribers');

    try {
      let candidateIds: string[] = [];

      // Support pasting a Steam Workshop URL or numeric Workshop ID directly
      const urlIdMatch = q.match(/sharedfiles\/filedetails\/\?id=(\d+)/i) || (/^\d{6,12}$/.test(q) ? [q, q] : null);
      if (urlIdMatch) {
        candidateIds = [urlIdMatch[1]];
      } else {
        const browseUrl = new URL('https://steamcommunity.com/workshop/browse/');
        browseUrl.searchParams.set('appid', String(ISAAC_APP_ID));
        browseUrl.searchParams.set('section', 'readytouseitems');
        browseUrl.searchParams.set('browsesort', q && sort === 'totaluniquesubscribers' ? 'textsearch' : sort);
        browseUrl.searchParams.set('actualsort', q && sort === 'totaluniquesubscribers' ? 'textsearch' : sort);
        browseUrl.searchParams.set('p', String(page));
        if (q) browseUrl.searchParams.set('searchtext', q);
        if (tagParam && tagParam !== 'All') {
          browseUrl.searchParams.append('requiredtags[]', tagParam);
        }

        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 10000);
        let html = '';
        try {
          const browseRes = await fetch(browseUrl.toString(), {
            signal: ac.signal,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          });
          html = await browseRes.text();
        } finally {
          clearTimeout(timer);
        }
        const matches = [...html.matchAll(/sharedfiles\/filedetails\/\?id=(\d+)/g)].map((m) => m[1]);
        candidateIds = [...new Set(matches)].slice(0, 24);
      }

      if (!candidateIds.length) {
        return res.json({
          appId: ISAAC_APP_ID,
          appName: 'The Binding of Isaac: Rebirth / Repentance+',
          page,
          hasMore: false,
          items: [],
        });
      }

      const details = await fetchSteamPublishedDetails(candidateIds);

      // Strictly enforce creator_app_id === 250900 & consumer_app_id === 250900 (no other Steam games allowed)
      const items = details
        .filter(
          (d: any) =>
            d &&
            d.result === 1 &&
            Number(d.creator_app_id) === ISAAC_APP_ID &&
            Number(d.consumer_app_id) === ISAAC_APP_ID &&
            Number(d.file_size) > 0
        )
        .map((d: any) => {
          const id = String(d.publishedfileid);
          const fileSize = Number(d.file_size) || 0;
          const cached = cachedIsaacModsMap.get(id);
          return {
            id,
            title: String(d.title || `Mod ${id}`),
            description: cleanSteamBbCode(d.description || '').slice(0, 280),
            previewUrl: String(d.preview_url || ''),
            fileSize,
            subscriptions: Number(d.subscriptions) || 0,
            favorited: Number(d.favorited) || 0,
            views: Number(d.views) || 0,
            timeUpdated: Number(d.time_updated) || 0,
            tags: Array.isArray(d.tags) ? d.tags.map((t: any) => String(t.tag || '')).filter(Boolean) : [],
            workshopUrl: `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`,
            withinBudget: fileSize <= ISAAC_MOD_BUDGET_BYTES,
            added: !!cached,
            cachedZipBytes: cached?.bytes || null,
          };
        });

      return res.json({
        appId: ISAAC_APP_ID,
        appName: 'The Binding of Isaac: Rebirth / Repentance+',
        page,
        hasMore: !urlIdMatch && candidateIds.length >= 18,
        items,
      });
    } catch (err: any) {
      console.error('Isaac workshop search error:', err?.message || err);
      return res.status(502).json({
        error: 'Unable to reach Steam Workshop right now. Try again in a moment.',
      });
    }
  });

  async function resolveAndDownloadIsaacModZip(id: string): Promise<{ buffer: Buffer; detail: any }> {
    const details = await fetchSteamPublishedDetails([id]);
    const detail = details[0];
    if (
      !detail ||
      detail.result !== 1 ||
      Number(detail.creator_app_id) !== ISAAC_APP_ID ||
      Number(detail.consumer_app_id) !== ISAAC_APP_ID
    ) {
      throw new Error('This Workshop item does not belong to The Binding of Isaac (App 250900).');
    }

    const expectedSize = Number(detail.file_size) || 0;
    if (expectedSize > ISAAC_MOD_BUDGET_BYTES) {
      throw new Error(
        `Mod is ${(expectedSize / 1048576).toFixed(1)} MB, exceeding the 96 MB browser mod limit.`
      );
    }

    let downloadUrl = typeof detail.file_url === 'string' && detail.file_url.startsWith('http') ? detail.file_url : '';

    if (!downloadUrl) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 15000);
      try {
        const swdRes = await fetch('http://steamworkshop.download/online/steamonline.php', {
          method: 'POST',
          signal: ac.signal,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: `http://steamworkshop.download/download/view/${id}`,
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: new URLSearchParams({ item: id, app: String(ISAAC_APP_ID) }),
        });
        const swdText = await swdRes.text();
        const linkMatch = swdText.match(/href=['"](https?:\/\/[^'"]+\.zip)['"]/i);
        if (linkMatch) {
          downloadUrl = linkMatch[1];
        } else if (swdText.toLowerCase().includes('disabled file downloads')) {
          throw new Error(
            'Steam restricts automated public mirror downloads for this specific Workshop upload. Download its .zip manually or choose another mod from search.'
          );
        } else {
          throw new Error('Workshop download mirror could not resolve an archive for this item.');
        }
      } finally {
        clearTimeout(timer);
      }
    }

    const zipAc = new AbortController();
    const zipTimer = setTimeout(() => zipAc.abort(), 30000);
    try {
      const zipRes = await fetch(downloadUrl, { signal: zipAc.signal });
      if (!zipRes.ok) {
        throw new Error(`Archive server responded with HTTP ${zipRes.status}.`);
      }
      const buffer = Buffer.from(await zipRes.arrayBuffer());
      if (buffer.length < 22 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
        throw new Error('Downloaded file was not a valid .zip mod archive.');
      }
      if (!zipHasRealFiles(buffer)) {
        throw new Error(
          'Steam Workshop mirror returned an empty folder archive for this mod (Steam restricts direct downloads for this upload).'
        );
      }
      if (buffer.length > ISAAC_MOD_BUDGET_BYTES) {
        throw new Error(
          `Archive is ${(buffer.length / 1048576).toFixed(1)} MB, exceeding the 96 MB browser mod limit.`
        );
      }
      return { buffer, detail };
    } finally {
      clearTimeout(zipTimer);
    }
  }

  // Add a Workshop mod to the Isaac Mod Catalogue & download cache
  app.post('/api/isaac/workshop/add', async (req, res) => {
    const id = String(req.body?.id || '').trim();
    if (!/^\d{5,14}$/.test(id)) {
      return res.status(400).json({ error: 'Invalid Steam Workshop mod ID.' });
    }

    const existing = cachedIsaacModsMap.get(id);
    if (existing && fs.existsSync(existing.zipPath)) {
      return res.json({ success: true, mod: existing });
    }

    try {
      const { buffer, detail } = await resolveAndDownloadIsaacModZip(id);
      const zipPath = path.join(ISAAC_CACHE_DIR, `${id}.zip`);
      fs.writeFileSync(zipPath, buffer);

      const entry: CachedIsaacMod = {
        id,
        name: String(detail.title || `Workshop Mod ${id}`),
        description: cleanSteamBbCode(detail.description || '').slice(0, 240),
        previewUrl: String(detail.preview_url || ''),
        bytes: buffer.length,
        fileSize: Number(detail.file_size) || buffer.length,
        subscriptions: Number(detail.subscriptions) || 0,
        tags: Array.isArray(detail.tags) ? detail.tags.map((t: any) => String(t.tag || '')).filter(Boolean) : [],
        addedAt: new Date().toISOString(),
        zipPath,
      };
      cachedIsaacModsMap.set(id, entry);
      persistIsaacIndex();

      return res.json({ success: true, mod: entry });
    } catch (err: any) {
      return res.status(422).json({ error: err?.message || 'Failed to download mod from Steam Workshop.' });
    }
  });

  // List added Isaac mods for UI
  app.get('/api/isaac/mods', (_req, res) => {
    const list = Array.from(cachedIsaacModsMap.values()).map(({ zipPath: _zp, ...rest }) => rest);
    res.json({ mods: list, budgetBytes: ISAAC_MOD_BUDGET_BYTES });
  });

  // Remove an added Isaac mod from catalogue
  app.delete('/api/isaac/mods/:id', (req, res) => {
    const id = String(req.params.id || '').trim();
    const existing = cachedIsaacModsMap.get(id);
    if (existing) {
      try {
        if (fs.existsSync(existing.zipPath)) fs.unlinkSync(existing.zipPath);
      } catch {}
      cachedIsaacModsMap.delete(id);
      persistIsaacIndex();
    }
    res.json({ success: true });
  });

  // Direct .zip download endpoint for drag-and-drop into Isaac IMPORT MOD
  app.get('/api/isaac/workshop/zip/:id', async (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!/^\d{5,14}$/.test(id)) {
      return res.status(400).send('Invalid mod ID.');
    }

    try {
      let existing = cachedIsaacModsMap.get(id);
      let buffer: Buffer;
      let modName = existing?.name || `isaac-mod-${id}`;

      if (existing && fs.existsSync(existing.zipPath)) {
        buffer = fs.readFileSync(existing.zipPath);
      } else {
        const resolved = await resolveAndDownloadIsaacModZip(id);
        buffer = resolved.buffer;
        modName = String(resolved.detail?.title || modName);
      }

      const safeFilename =
        modName
          .toLowerCase()
          .replace(/[^a-z0-9._-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 48) || `isaac-mod-${id}`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}-${id}.zip"`);
      res.setHeader('Content-Length', String(buffer.length));
      return res.send(buffer);
    } catch (err: any) {
      return res.status(422).json({ error: err?.message || 'Unable to download mod .zip.' });
    }
  });

  // Native Isaac Web Port (?catalogue=...) CORS + COEP-friendly endpoints
  const setIsaacCatalogueCors = (res: express.Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'no-cache');
  };

  app.options('/api/isaac-mods/*', (_req, res) => {
    setIsaacCatalogueCors(res);
    res.status(204).end();
  });

  const ISAAC_MOD_PART_SIZE = 3 * 1024 * 1024;

  app.get('/api/isaac-mods/catalogue.json', (_req, res) => {
    setIsaacCatalogueCors(res);
    const mods = Array.from(cachedIsaacModsMap.values()).map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      bytes: m.bytes,
      parts: Math.max(1, Math.ceil((m.bytes || 0) / ISAAC_MOD_PART_SIZE)),
    }));
    res.json({ mods });
  });

  app.get('/api/isaac-mods/m/:file', (req, res) => {
    setIsaacCatalogueCors(res);
    const match = String(req.params.file || '').match(/^(\d+)\.(\d+)\.bin$/);
    if (!match) {
      return res.status(404).send('Mod part not found.');
    }
    const mod = cachedIsaacModsMap.get(match[1]);
    const partIdx = Number(match[2]);
    if (!mod || !fs.existsSync(mod.zipPath) || !Number.isInteger(partIdx) || partIdx < 0) {
      return res.status(404).send('Mod archive not found.');
    }
    const totalBytes = fs.statSync(mod.zipPath).size;
    const partCount = Math.max(1, Math.ceil(totalBytes / ISAAC_MOD_PART_SIZE));
    if (partIdx >= partCount) {
      return res.status(404).send('Mod part out of range.');
    }
    const start = partIdx * ISAAC_MOD_PART_SIZE;
    const end = Math.min(totalBytes, start + ISAAC_MOD_PART_SIZE) - 1;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(end - start + 1));
    return fs.createReadStream(mod.zipPath, { start, end }).pipe(res);
  });

  // ============================================================================
  // ISAAC WEB PORT HOST PROXY (/api/isaac-game)
  // - Pure HTTP 200 <=3 MB segmented/sliced delivery (zero HTTP 206 / Range headers from browser)
  // - Main-window async preadBytes with read-ahead cache (zero blob: Worker cookie loss)
  // - Fixes empty MODS screen (always seeds IMPORT MOD) + auto-syncs Workshop mods
  // ============================================================================
  const ISAAC_UPSTREAM_BASE = 'https://truffled.lol/games/boir';
  const ISAAC_HTML_CACHE_FILE = path.join(ISAAC_CACHE_DIR, 'boir-upstream-index.html');
  const ISAAC_CHUNKS_CACHE_DIR = path.join(ISAAC_CACHE_DIR, 'chunks');
  const ISAAC_PORTABLE_PART_SIZE = 1024 * 1024;
  const ISAAC_SLICE_MAX_BYTES = 4 * 1024 * 1024;
  try {
    fs.mkdirSync(ISAAC_CHUNKS_CACHE_DIR, { recursive: true });
  } catch {}
  let cachedPatchedBoirHtml: string | null = null;

  function buildPatchedPortableScript(): string {
    return `(function () {
  function showEarlyErr(title, text) {
    try {
      var s = document.getElementById('status');
      if (s) s.textContent = title + (text ? ': ' + text : '');
      var p = document.getElementById('error');
      var t = document.getElementById('error-title');
      var x = document.getElementById('error-text');
      if (p && t && x) { t.textContent = title; x.textContent = text || ''; p.hidden = false; }
    } catch (e) {}
  }
  window.__isaacShowError = showEarlyErr;
  window.addEventListener('error', function (ev) { showEarlyErr('Script error', ev.message || 'Unknown error'); });
  window.addEventListener('unhandledrejection', function (ev) { var r = ev.reason; showEarlyErr('Load error', (r && r.message) ? r.message : String(r || 'Rejected')); });

  var P = window.__isaacPortableData;
  var S = P.streams;
  var cache = new Map(), inline = P.blobs || null, ranges = true;
  var PART_SIZE = ${ISAAC_PORTABLE_PART_SIZE};
  var SLICE_BASE = '/api/isaac-game/slice';
  var CHUNK_BASE = P.base || '/api/isaac-game/c';
  var MAX_PART_INFLIGHT = 3;
  var pieceInflight = new Map();
  var sliceCache = new Map();
  var sliceInflight = new Map();
  var chunkBytesGot = new Map();
  var chunkBytesTotal = new Map();
  var DEFAULT_CORE_BYTES = 44046118;
  var activeStatusNote = '';

  if (Array.isArray(P.coreSizes)) {
    for (var ci = 0; ci < P.coreSizes.length; ci++) {
      if (P.coreSizes[ci] > 0) chunkBytesTotal.set('0:' + ci, P.coreSizes[ci]);
    }
  }

  function reportCoreProgress(label) {
    if (typeof label === 'string') activeStatusNote = label;
    var got = 0, knownTot = 0, nKnown = 0;
    chunkBytesGot.forEach(function (v) { got += v; });
    chunkBytesTotal.forEach(function (v) { knownTot += v; nKnown += 1; });
    var estTotal = nKnown >= 4 ? knownTot : Math.max(DEFAULT_CORE_BYTES, got + 1048576);
    var pct = Math.max(1, Math.min(76, Math.round((76 * got) / Math.max(1, estTotal))));
    window.__isaacLoadedPct = pct;
    try {
      var bf = document.getElementById('bar-fill');
      if (bf) bf.style.width = pct + '%';
      var st = document.getElementById('status');
      if (st) {
        var mbText = (got / 1048576).toFixed(1) + ' / ' + (estTotal / 1048576).toFixed(1) + ' MB';
        st.textContent = activeStatusNote ? (activeStatusNote + ' (' + mbText + ')') : ('loading core ' + pct + '% (' + mbText + ')');
      }
      if (P.onChunk) P.onChunk(pct, 100);
    } catch (e) {}
  }

  var KEY = P.key ? (function () {
    var b = atob(P.key), a = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return a;
  })() : null;
  function unscramble(bytes, pos) {
    if (!KEY) return bytes;
    for (var i = 0; i < bytes.length; i++) {
      var at = pos + i;
      bytes[i] ^= KEY[at & 255] ^ ((at >> 8) & 255);
    }
    return bytes;
  }
  var loaded = Object.create(null), loadedN = 0;
  function note(s, i) {
    var k = s + ':' + i;
    if (loaded[k]) return;
    loaded[k] = 1; loadedN += 1;
  }
  function decode(b) {
    return (typeof Uint8Array.fromBase64 === 'function')
      ? Uint8Array.fromBase64(b)
      : (function () { var s = atob(b), a = new Uint8Array(s.length); for (var k = 0; k < s.length; k++) a[k] = s.charCodeAt(k); return a; })();
  }
  function span(s, a, b) {
    var st = S[s], parts = [], o = 0;
    for (var pos = a; pos < b;) {
      var i = Math.floor(pos / st.size), within = pos % st.size;
      var take = Math.min(st.size - within, b - pos);
      parts.push({ s: s, i: i, within: within, take: take, at: o });
      o += take; pos += take;
    }
    return parts;
  }
  function fileOf(s, i) {
    return S[s].tag + i + '.bin';
  }
  function sliceUrl(s, i, query) {
    var v = S[s].v && S[s].v[i];
    return SLICE_BASE + '/' + fileOf(s, i) + '?' + query + (v ? '&v=' + v : '');
  }
  function wholeChunkUrl(s, i) {
    var v = S[s].v && S[s].v[i];
    return CHUNK_BASE + '/' + fileOf(s, i) + (v ? '?v=' + v : '');
  }

  // Bounded concurrency queue for core part fetches so proxies never saturate
  var partInflightCount = 0;
  var partWaitQueue = [];
  function withPartSlot(fn) {
    return new Promise(function (resolve, reject) {
      function run() {
        partInflightCount += 1;
        Promise.resolve().then(fn).then(
          function (res) { partInflightCount -= 1; drainPartQueue(); resolve(res); },
          function (err) { partInflightCount -= 1; drainPartQueue(); reject(err); }
        );
      }
      if (partInflightCount < MAX_PART_INFLIGHT) run();
      else partWaitQueue.push(run);
    });
  }
  function drainPartQueue() {
    while (partInflightCount < MAX_PART_INFLIGHT && partWaitQueue.length) {
      var next = partWaitQueue.shift();
      next();
    }
  }

  async function fetchAndReadWithRetry(url, label, partKey, opts) {
    var o = opts || {};
    var maxAttempts = o.attempts || 4;
    var headerTimeoutMs = o.headerTimeoutMs || 15000;
    var stallTimeoutMs = o.stallTimeoutMs || 8000;
    var allow416 = !!o.allow416;
    var lastErr = null;

    for (var attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        if (partKey) {
          chunkBytesGot.set(partKey, 0);
          reportCoreProgress('retrying ' + label + ' (' + (attempt + 1) + '/' + maxAttempts + ')');
        }
        await new Promise(function (res) { setTimeout(res, 350 * attempt); });
      }
      var ac = new AbortController();
      var headerTimer = setTimeout(function () { ac.abort(new Error(label + ' response timeout')); }, headerTimeoutMs);
      var stallTimer = null;
      try {
        var r = await fetch(url, { credentials: 'same-origin', signal: ac.signal });
        clearTimeout(headerTimer);
        if (allow416 && (r.status === 416 || r.status === 404)) {
          return { eof: true, status: r.status, headers: r.headers, bytes: new Uint8Array(0) };
        }
        var ct = (r.headers.get('content-type') || '').toLowerCase();
        if (!r.ok || ct.indexOf('text/html') !== -1) {
          throw new Error(label + ': HTTP ' + r.status + (ct.indexOf('text/html') !== -1 ? ' (html redirect)' : ''));
        }
        var bytes;
        if (!r.body || !r.body.getReader) {
          stallTimer = setTimeout(function () { ac.abort(new Error(label + ' body timeout')); }, stallTimeoutMs * 2);
          bytes = new Uint8Array(await r.arrayBuffer());
          clearTimeout(stallTimer);
          if (partKey) {
            chunkBytesGot.set(partKey, bytes.length);
            reportCoreProgress('');
          }
        } else {
          var reader = r.body.getReader(), chunks = [], total = 0;
          for (;;) {
            stallTimer = setTimeout(function () { ac.abort(new Error(label + ' stream stalled')); }, stallTimeoutMs);
            var step = await reader.read();
            clearTimeout(stallTimer);
            stallTimer = null;
            if (step.done) break;
            var val = step.value;
            chunks.push(val);
            total += val.length;
            if (partKey) {
              chunkBytesGot.set(partKey, total);
              reportCoreProgress('');
            }
          }
          bytes = new Uint8Array(total);
          var off = 0;
          for (var k = 0; k < chunks.length; k++) { bytes.set(chunks[k], off); off += chunks[k].length; }
        }
        if (o.requireNonEmpty && bytes.length === 0) {
          throw new Error(label + ': empty body');
        }
        return { eof: false, status: r.status, headers: r.headers, bytes: bytes };
      } catch (err) {
        clearTimeout(headerTimer);
        if (stallTimer) clearTimeout(stallTimer);
        lastErr = err;
      }
    }
    throw lastErr || new Error(label + ': fetch failed');
  }

  async function piece(s, i) {
    var key = s + ':' + i, hit = cache.get(key);
    if (hit) return hit;
    var pending = pieceInflight.get(key);
    if (pending) return pending;
    var job = (async function () {
      var fName = fileOf(s, i);
      var raw = null;
      try {
        var r0 = await withPartSlot(function () {
          return fetchAndReadWithRetry(sliceUrl(s, i, 'part=0'), fName + '#0', key + ':0', { requireNonEmpty: true });
        });
        var countHdr = Number(r0.headers.get('x-part-count') || '0');
        var totalBytesHdr = Number(r0.headers.get('x-total-bytes') || '0');
        if (totalBytesHdr > 0) chunkBytesTotal.set(key, totalBytesHdr);
        var partBufs = [r0.bytes];

        if (countHdr > 1) {
          var rest = [];
          for (var idx = 1; idx < countHdr; idx++) {
            (function (n) {
              rest.push(withPartSlot(function () {
                return fetchAndReadWithRetry(sliceUrl(s, i, 'part=' + n), fName + '#' + n, key + ':' + n, { requireNonEmpty: true })
                  .then(function (res) { return res.bytes; });
              }));
            })(idx);
          }
          var restBufs = await Promise.all(rest);
          for (var j = 0; j < restBufs.length; j++) partBufs.push(restBufs[j]);
        } else if (!countHdr && r0.bytes.length === PART_SIZE) {
          for (var n = 1; n < 128; n++) {
            var rn = await withPartSlot(function () {
              return fetchAndReadWithRetry(sliceUrl(s, i, 'part=' + n), fName + '#' + n, key + ':' + n, { allow416: true });
            });
            if (rn.eof || !rn.bytes.length) break;
            partBufs.push(rn.bytes);
            if (rn.bytes.length < PART_SIZE) break;
          }
        }
        var totalLen = partBufs.reduce(function (sum, b) { return sum + b.length; }, 0);
        raw = new Uint8Array(totalLen);
        var off = 0;
        for (var k = 0; k < partBufs.length; k++) { raw.set(partBufs[k], off); off += partBufs[k].length; }
      } catch (partErr) {
        chunkBytesGot.forEach(function (_v, ck) {
          if (ck.indexOf(key + ':') === 0) chunkBytesGot.delete(ck);
        });
        var full = await fetchAndReadWithRetry(wholeChunkUrl(s, i), fName + ' full', key + ':full', {
          attempts: 3,
          headerTimeoutMs: 25000,
          stallTimeoutMs: 12000,
          requireNonEmpty: true
        });
        raw = full.bytes;
        if (raw.length > 0 && !chunkBytesTotal.get(key)) chunkBytesTotal.set(key, raw.length);
      }
      note(s, i);
      raw = unscramble(raw, i * S[s].size);
      var u = S[s].gz
        ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())
        : raw;
      cache.set(key, u);
      return u;
    })().finally(function () { pieceInflight.delete(key); });
    pieceInflight.set(key, job);
    return job;
  }

  function cacheSlice(key, bytes) {
    if (sliceCache.has(key)) sliceCache.delete(key);
    sliceCache.set(key, bytes);
    while (sliceCache.size > 72) {
      sliceCache.delete(sliceCache.keys().next().value);
    }
  }
  function fetchSliceWindow(s, i, within, take) {
    var key = s + ':' + i + ':' + within + ':' + take;
    var cached = sliceCache.get(key);
    if (cached) {
      sliceCache.delete(key);
      sliceCache.set(key, cached);
      return Promise.resolve(cached);
    }
    var pending = sliceInflight.get(key);
    if (pending) return pending;
    var end = within + take - 1;
    var p = fetchAndReadWithRetry(sliceUrl(s, i, 's=' + within + '&e=' + end), fileOf(s, i) + '@' + within, null, {
      attempts: 4,
      headerTimeoutMs: 15000,
      stallTimeoutMs: 8000,
      requireNonEmpty: true
    })
      .then(function (res) {
        var u = unscramble(res.bytes, i * S[s].size + within);
        note(s, i);
        cacheSlice(key, u);
        return u;
      })
      .finally(function () { sliceInflight.delete(key); });
    sliceInflight.set(key, p);
    return p;
  }
  async function ranged(p) {
    if (!ranges) return (await piece(p.s, p.i)).subarray(p.within, p.within + p.take);
    var u = await fetchSliceWindow(p.s, p.i, p.within, p.take);
    var cl = chunkLen(p.s, p.i);
    if (p.take >= 65536 && cl > 0) {
      var stSize = S[p.s].size;
      for (var k = 1; k <= 2; k++) {
        var absPos = p.i * stSize + p.within + k * p.take;
        var nextI = Math.floor(absPos / stSize);
        if (nextI >= count(p.s)) break;
        var nextWithin = absPos % stSize;
        var ncl = chunkLen(p.s, nextI);
        if (ncl <= 0 || nextWithin >= ncl) break;
        var nextTake = Math.min(p.take, ncl - nextWithin);
        if (nextTake > 0) fetchSliceWindow(p.s, nextI, nextWithin, nextTake).catch(function () {});
      }
    }
    return u;
  }
  async function gather(parts) {
    var total = parts.reduce(function (n, p) { return n + p.take; }, 0);
    var out = new Uint8Array(total), next = 0;
    async function worker() {
      for (;;) {
        var k = next++;
        if (k >= parts.length) return;
        var p = parts[k];
        var bytes = S[p.s].gz ? (await piece(p.s, p.i)).subarray(p.within, p.within + p.take) : await ranged(p);
        out.set(bytes, p.at);
      }
    }
    var crew = [];
    for (var w = 0; w < Math.min(4, parts.length); w++) crew.push(worker());
    await Promise.all(crew);
    return out;
  }
  function locate(rel, off, len) {
    var f = P.files[rel];
    if (!f) return null;
    var end = len ? Math.min(off + len, f.size) : f.size;
    return span(f.s, f.at + off, f.at + end);
  }
  function chunkLen(s, i) {
    var st = S[s];
    if (st.gz || typeof st.bytes !== 'number') return -1;
    var left = st.bytes - i * st.size;
    return left > st.size ? st.size : left;
  }
  async function probeRanges() {
    ranges = true;
    return true;
  }
  function count(s) {
    var st = S[s];
    if (typeof st.n === 'number') return st.n;
    if (typeof st.bytes === 'number' && st.size) return Math.ceil(st.bytes / st.size);
    return 0;
  }
  async function prefetchAll() {
    reportCoreProgress('connecting to game assets');
    var jobs = [], s, i, n;
    for (s = 0; s < S.length; s++) {
      if (ranges && S[s].gz === false) continue;
      n = count(s);
      for (i = 0; i < n; i++) jobs.push([s, i]);
    }
    await Promise.all(jobs.map(function (job) {
      return piece(job[0], job[1]);
    }));
    window.__isaacLoadedPct = 80;
    if (P.onChunk) { try { P.onChunk(80, 100); } catch (e) {} }
  }
  window.isaacPortable = {
    manifest: P.manifest,
    index: P.index,
    trail: P.trail || null,
    status: P.status,
    ready: (async function () {
      if (!P.base) return ranges;
      await probeRanges();
      await prefetchAll();
      return ranges;
    })(),
    ranges: function () { return ranges; },
    key: KEY,
    chunks: P.chunks || 0,
    rangesWhy: function () { return P.rangesWhy || null; },
    loaded: function () { return loadedN; },
    urlFor: null,
    bytesFor: P.base
      ? function (rel, off, len) { var p = locate(rel, off, len); return p ? gather(p) : null; }
      : function (rel, off, len) {
          var parts = locate(rel, off, len);
          if (!parts) return null;
          var total = parts.reduce(function (n, q) { return n + q.take; }, 0);
          var out = new Uint8Array(total);
          for (var k = 0; k < parts.length; k++) {
            var q = parts[k], key = q.s + ':' + q.i, u = cache.get(key);
            if (!u) { u = decode(inline[S[q.s].first + q.i]); cache.set(key, u); if (cache.size > 24) cache.delete(cache.keys().next().value); }
            out.set(u.subarray(q.within, q.within + q.take), q.at);
          }
          return out;
        },
  };
})();`;
  }

  function patchBoirIndexHtml(rawHtml: string): string {
    let html = rawHtml.replace(
      /<script[^>]*googletagmanager\.com\/gtag\/js[^>]*><\/script>\s*(?:<script>[\s\S]*?gtag[\s\S]*?<\/script>)?/gi,
      ''
    );

    const pDataMarker = 'window.__isaacPortableData = ';
    const pds = html.indexOf(pDataMarker);
    const pde = pds !== -1 ? html.indexOf(';</script>', pds) : -1;
    if (pds !== -1 && pde !== -1) {
      try {
        const pData = JSON.parse(html.slice(pds + pDataMarker.length, pde));
        pData.base = '/api/isaac-game/c';
        const st0 = Array.isArray(pData.streams) ? pData.streams[0] : null;
        if (st0 && st0.tag === 'a') {
          const n = typeof st0.n === 'number' ? st0.n : 4;
          const coreSizes: number[] = [];
          for (let i = 0; i < n; i++) {
            const safeV = (Array.isArray(st0.v) && st0.v[i]) || 'nov';
            const cp = path.join(ISAAC_CHUNKS_CACHE_DIR, `a${i}.bin.${safeV}`);
            coreSizes.push(fs.existsSync(cp) ? fs.statSync(cp).size : 0);
          }
          if (coreSizes.every((sz) => sz > 0)) {
            pData.coreSizes = coreSizes;
          }
        }
        html =
          html.slice(0, pds + pDataMarker.length) +
          JSON.stringify(pData).replace(/<\/script>/gi, '<\\/script>') +
          html.slice(pde);
      } catch {}
    }

    const modMarker = 'window.__isaacModules = ';
    const ms = html.indexOf(modMarker);
    const me = ms !== -1 ? html.indexOf(';</script>', ms) : -1;

    if (ms !== -1 && me !== -1) {
      const jsonStr = html.slice(ms + modMarker.length, me);
      const modules: Record<string, string> = JSON.parse(jsonStr);

      if (typeof modules['mods.mjs'] === 'string') {
        modules['mods.mjs'] = modules['mods.mjs']
          .replace('if(o.sentinel!==false&&on.length){', 'if(o.sentinel!==false){')
          .replace(
            'const have=new Set(mods.map((m)=>m.id));',
            'const have=new Set(mods.flatMap((m)=>m.workshopId?[m.id,String(m.workshopId)]:[m.id]));'
          );
      }

      if (typeof modules['play.mjs'] === 'string') {
        modules['play.mjs'] = modules['play.mjs']
          .replace(
            "import{createModsMenu,openModDb,listMods,MODS_DB}from'./mods.mjs';",
            "import{createModsMenu,openModDb,listMods,MODS_DB,putMod,deleteMod,planMod,fetchCatalogue,fetchMod}from'./mods.mjs';"
          )
          .replace(
            'if(portable&&portable.chunks){stages.chunks.total=portable.chunks;render();window.__isaacPortableData.onChunk=(got,total)=>{stages.chunks.received=got;stages.chunks.total=total||stages.chunks.total;stages.chunks.done=got>=stages.chunks.total;setStatus(`loading ${got} / ${stages.chunks.total}`);render();};}',
            'if(portable&&portable.chunks){stages.chunks.total=100;stages.chunks.received=window.__isaacLoadedPct||0;render();window.__isaacPortableData.onChunk=(got,total)=>{stages.chunks.received=got;stages.chunks.total=total||100;stages.chunks.done=got>=stages.chunks.total;render();};}'
          )
          .replace(
            'if(portable&&portable.ready){try{await portable.ready;}catch(e){throw new Error(`portable chunks: ${e&&e.message||e}`);}',
            'if(portable&&portable.ready){try{await portable.ready;}catch(e){const msg=`portable chunks: ${e&&e.message||e}`;if(window.__isaacShowError)window.__isaacShowError("Failed to download game chunks",msg);throw new Error(msg);}'
          )
          .replace(
            'const{instance,module}=await WebAssembly.instantiate(bytes,info);setStatus(\'loading\');receive(instance,module);',
            'setStatus(\'compiling engine (51 MB)...\');const{instance,module}=await WebAssembly.instantiate(bytes,info);setStatus(\'initializing runtime...\');receive(instance,module);'
          )
          .replace(
            "setStatus('loading');stages.module.received=0;import('./boot_web.mjs')",
            `stages.chunks.received=Math.max(stages.chunks.received||0,82);render();try{const catBase=params.get('catalogue')||(typeof window!=='undefined'?window.isaacModCatalogue:null)||'/api/isaac-mods';if(catBase){const cat=await Promise.race([fetchCatalogue(catBase),new Promise((_,rej)=>setTimeout(()=>rej(new Error('catalogue timeout')),8000))]);const db=await openModDb();if(db&&cat&&Array.isArray(cat.mods)){const existing=await listMods(db);const wantedIds=new Set(cat.mods.map((m)=>String(m.id)));for(const old of existing){if(old.workshopId&&!wantedIds.has(String(old.workshopId))){await deleteMod(db,old.id);}}const afterDelete=await listMods(db);const haveIds=new Set(afterDelete.flatMap((m)=>m.workshopId?[m.id,String(m.workshopId)]:[m.id]));const missing=cat.mods.filter((e)=>!haveIds.has(String(e.id)));if(missing.length)setStatus('syncing workshop mods...');let syncedAny=false;for(const entry of missing){try{const zipBytes=await fetchMod(catBase,entry);const rawEntries=await unzip(zipBytes.buffer.slice(zipBytes.byteOffset,zipBytes.byteOffset+zipBytes.byteLength));const{mod,files}=planMod(rawEntries,entry.name);mod.workshopId=String(entry.id);if(!haveIds.has(mod.id)){await putMod(db,mod,files);haveIds.add(mod.id);haveIds.add(String(entry.id));syncedAny=true;}}catch(err){console.warn('[workshop-sync] skipped mod',entry.id,err);}}try{db.close();}catch{}if(syncedAny||(afterDelete.length>0)){try{await enableModsInOptions();}catch{}}}}}catch(err){console.warn('[workshop-sync]',err);}stages.chunks.received=88;render();setStatus('loading boot.wasm...');stages.module.received=0;import('./boot_web.mjs')`
          )
          .replace(
            'let lastFrame=0,lastT=performance.now(),firstFrameSeen=false,finished=false;setInterval(()=>{const f=window.isaacFrame||0;const now=performance.now();if(f>0&&!firstFrameSeen){firstFrameSeen=true;overlay.hidden=true;canvas.focus();}',
            'let lastFrame=0,lastT=performance.now(),firstFrameSeen=false,finished=false,mountTimer=null;setInterval(()=>{const f=window.isaacFrame||0;const now=performance.now();if(f>=3&&!firstFrameSeen){firstFrameSeen=true;overlay.hidden=true;canvas.focus();}else if(f>0&&!firstFrameSeen){stages.chunks.received=96;render();setStatus(\'mounting game assets...\');if(!mountTimer){mountTimer=setTimeout(()=>{if(!firstFrameSeen){firstFrameSeen=true;overlay.hidden=true;canvas.focus();}},15000);}}'
          );
      }

      const patchedJson = JSON.stringify(modules).replace(/<\/script>/gi, '<\\/script>');
      html = html.slice(0, ms + modMarker.length) + patchedJson + html.slice(me);
    }

    const pStart = html.indexOf('(function () {\n  var P = window.__isaacPortableData;');
    const pStartAlt = pStart !== -1 ? pStart : html.indexOf('(function () {  var P = window.__isaacPortableData;');
    if (pStartAlt !== -1) {
      const pEnd = html.indexOf('</script>', pStartAlt);
      if (pEnd !== -1) {
        html = html.slice(0, pStartAlt) + buildPatchedPortableScript() + html.slice(pEnd);
      }
    }

    html = html
      .replace('"base":"./c"', '"base":"/api/isaac-game/c"')
      .replace(
        '<script>window.isaacModCatalogue = "./mods";</script>',
        '<script>window.isaacModCatalogue = "/api/isaac-mods";</script>'
      );

    return html;
  }

  // Deduplicated background chunk cacher so slice/part reads hit local SSD in <1ms
  const inflightChunkWarmers = new Map<string, Promise<void>>();
  let bootPrewarmStarted = false;
  const ISAAC_UPSTREAM_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Referer: `${ISAAC_UPSTREAM_BASE}/index.html`,
  };

  function warmChunkToDisk(file: string, vParam: string, safeV: string): Promise<void> {
    const cacheKey = `${file}.${safeV}`;
    const destPath = path.join(ISAAC_CHUNKS_CACHE_DIR, cacheKey);
    try {
      if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
        return Promise.resolve();
      }
    } catch {}
    const existing = inflightChunkWarmers.get(cacheKey);
    if (existing) return existing;

    const job = (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const tmpPath = `${destPath}.${process.pid}.${Date.now()}.tmp`;
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 60000);
        try {
          const res = await fetch(`${ISAAC_UPSTREAM_BASE}/c/${file}${vParam}`, {
            signal: ac.signal,
            headers: ISAAC_UPSTREAM_HEADERS,
          });
          clearTimeout(timer);
          if (!res.ok) {
            console.warn(`[isaac-warm] HTTP ${res.status} for ${file} (attempt ${attempt + 1})`);
            continue;
          }
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length === 0) continue;
          fs.writeFileSync(tmpPath, buf);
          fs.renameSync(tmpPath, destPath);
          return;
        } catch (err: any) {
          clearTimeout(timer);
          console.warn(`[isaac-warm] error for ${file} (attempt ${attempt + 1}):`, err?.message || err);
          try {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
          } catch {}
        }
      }
    })().finally(() => {
      inflightChunkWarmers.delete(cacheKey);
    });

    inflightChunkWarmers.set(cacheKey, job);
    return job;
  }

  function startBootPrewarmFromHtml(rawHtml: string) {
    if (bootPrewarmStarted) return;
    bootPrewarmStarted = true;
    try {
      const marker = 'window.__isaacPortableData = ';
      const ms = rawHtml.indexOf(marker);
      const me = ms !== -1 ? rawHtml.indexOf(';</script>', ms) : -1;
      if (ms === -1 || me === -1) return;
      const pData = JSON.parse(rawHtml.slice(ms + marker.length, me));
      const streams: Array<{ tag: string; v?: string[]; n?: number }> = Array.isArray(pData?.streams)
        ? pData.streams
        : [];
      const coreQueue: Array<{ file: string; vParam: string; safeV: string }> = [];
      const lazyQueue: Array<{ file: string; vParam: string; safeV: string }> = [];
      for (const st of streams) {
        const count = typeof st.n === 'number' ? st.n : Array.isArray(st.v) ? st.v.length : 0;
        for (let i = 0; i < count; i++) {
          const v = Array.isArray(st.v) ? st.v[i] : '';
          const entry = {
            file: `${st.tag}${i}.bin`,
            vParam: v ? `?v=${v}` : '',
            safeV: v || 'nov',
          };
          if (st.tag === 'a') coreQueue.push(entry);
          else lazyQueue.push(entry);
        }
      }
      const priority = (f: string) => {
        const n = parseInt(f.slice(1), 10);
        if (n <= 8 || n === 21 || n === 23) return 0;
        return 1;
      };
      lazyQueue.sort((x, y) => priority(x.file) - priority(y.file));

      (async () => {
        let cIdx = 0;
        await Promise.all(
          Array.from({ length: 4 }, async () => {
            while (cIdx < coreQueue.length) {
              const item = coreQueue[cIdx++];
              await warmChunkToDisk(item.file, item.vParam, item.safeV);
            }
          })
        );
        let lIdx = 0;
        await Promise.all(
          Array.from({ length: 2 }, async () => {
            while (lIdx < lazyQueue.length) {
              const item = lazyQueue[lIdx++];
              await warmChunkToDisk(item.file, item.vParam, item.safeV);
            }
          })
        );
      })().catch(() => {});
    } catch {}
  }

  function serveCachedChunkFile(
    req: express.Request,
    res: express.Response,
    cachedChunkPath: string,
    totalSize: number
  ) {
    const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range.trim() : '';
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Vary', 'Range');
    res.setHeader('Cache-Control', 'public, max-age=86400, no-transform');

    if (rangeHeader) {
      const m = rangeHeader.match(/^bytes=(\d+)-(\d*)$/i);
      if (!m) {
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        return res.status(416).end();
      }
      const start = Number(m[1]);
      const end = m[2] ? Math.min(Number(m[2]), totalSize - 1) : totalSize - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= totalSize || end < start) {
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        return res.status(416).end();
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      res.setHeader('Content-Length', String(end - start + 1));
      return fs.createReadStream(cachedChunkPath, { start, end }).pipe(res);
    }

    res.status(200);
    res.setHeader('Content-Length', String(totalSize));
    return fs.createReadStream(cachedChunkPath).pipe(res);
  }

  app.get('/api/isaac-game/boot-trail.json', (_req, res) => {
    res.status(404).end();
  });

  async function ensureIsaacHtmlLoaded(): Promise<string> {
    if (!cachedPatchedBoirHtml) {
      let rawHtml = '';
      if (fs.existsSync(ISAAC_HTML_CACHE_FILE)) {
        rawHtml = fs.readFileSync(ISAAC_HTML_CACHE_FILE, 'utf-8');
      } else {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 20000);
        try {
          const upstream = await fetch(`${ISAAC_UPSTREAM_BASE}/index.html`, { signal: ac.signal });
          if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);
          rawHtml = await upstream.text();
          try {
            fs.writeFileSync(ISAAC_HTML_CACHE_FILE, rawHtml, 'utf-8');
          } catch {}
        } finally {
          clearTimeout(timer);
        }
      }
      cachedPatchedBoirHtml = patchBoirIndexHtml(rawHtml);
      startBootPrewarmFromHtml(rawHtml);
    } else if (!bootPrewarmStarted && fs.existsSync(ISAAC_HTML_CACHE_FILE)) {
      try {
        startBootPrewarmFromHtml(fs.readFileSync(ISAAC_HTML_CACHE_FILE, 'utf-8'));
      } catch {}
    }
    return cachedPatchedBoirHtml;
  }

  app.get('/api/isaac-game/index.html', async (_req, res) => {
    try {
      const html = await ensureIsaacHtmlLoaded();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(html);
    } catch (err: any) {
      console.error('Failed to serve patched Isaac HTML:', err?.message || err);
      return res.redirect(`${ISAAC_UPSTREAM_BASE}/index.html`);
    }
  });

  // Pure HTTP 200 query-sliced & segmented endpoint (<= 3 MB parts, <= 4 MB slices)
  // Avoids HTTP 206 / Range headers and >4 MB proxy timeouts on AI Studio Cloud Run preview.
  app.get('/api/isaac-game/slice/:file', async (req, res) => {
    const file = String(req.params.file || '').trim();
    if (!/^[ab]\d{1,3}\.bin$/.test(file)) {
      return res.status(400).send('Invalid Isaac chunk filename.');
    }
    const rawV = typeof req.query.v === 'string' && /^[a-f0-9]{4,16}$/i.test(req.query.v) ? req.query.v : '';
    const vParam = rawV ? `?v=${rawV}` : '';
    const safeV = rawV || 'nov';
    const cachedChunkPath = path.join(ISAAC_CHUNKS_CACHE_DIR, `${file}.${safeV}`);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400, no-transform');
    res.setHeader('Access-Control-Expose-Headers', 'X-Part-Count, X-Total-Bytes');

    // Mode 1: Byte-range slice by query (?s=START&e=END), returned strictly as 200 OK
    if (req.query.s !== undefined && req.query.e !== undefined) {
      const start = Number(req.query.s);
      const end = Number(req.query.e);
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end < start ||
        end - start + 1 > ISAAC_SLICE_MAX_BYTES
      ) {
        return res.status(400).send('Invalid byte slice parameters.');
      }

      try {
        if (fs.existsSync(cachedChunkPath)) {
          const stat = fs.statSync(cachedChunkPath);
          if (stat.size > 0) {
            if (start >= stat.size) {
              return res.status(416).send('Slice start past EOF.');
            }
            const clampedEnd = Math.min(end, stat.size - 1);
            res.status(200);
            res.setHeader('Content-Length', String(clampedEnd - start + 1));
            return fs.createReadStream(cachedChunkPath, { start, end: clampedEnd }).pipe(res);
          }
        }
      } catch {}

      if (inflightChunkWarmers.size < 4) {
        warmChunkToDisk(file, vParam, safeV).catch(() => {});
      }

      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 30000);
      res.on('close', () => {
        if (!res.writableEnded) ac.abort();
      });
      try {
        const upstream = await fetch(`${ISAAC_UPSTREAM_BASE}/c/${file}${vParam}`, {
          signal: ac.signal,
          headers: { ...ISAAC_UPSTREAM_HEADERS, Range: `bytes=${start}-${end}` },
        });
        clearTimeout(timer);
        if (!upstream.ok && upstream.status !== 206) {
          return res.status(502).send(`Upstream slice HTTP ${upstream.status}`);
        }
        const buf = Buffer.from(await upstream.arrayBuffer());
        const expectedMax = end - start + 1;
        const out = upstream.status === 200 && buf.length > expectedMax ? buf.subarray(start, end + 1) : buf;
        res.status(200);
        res.setHeader('Content-Length', String(out.length));
        return res.send(out);
      } catch {
        clearTimeout(timer);
        if (!res.headersSent) return res.status(502).send('Failed to fetch Isaac slice.');
        return res.end();
      }
    }

    // Mode 2: Segmented chunk part (?part=N, <= 3 MB each, returned as 200 OK)
    const partIdx = req.query.part !== undefined ? Number(req.query.part) : 0;
    if (!Number.isInteger(partIdx) || partIdx < 0) {
      return res.status(400).send('Invalid part index.');
    }

    try {
      if (fs.existsSync(cachedChunkPath)) {
        const stat = fs.statSync(cachedChunkPath);
        if (stat.size > 0) {
          const partCount = Math.max(1, Math.ceil(stat.size / ISAAC_PORTABLE_PART_SIZE));
          if (partIdx >= partCount) {
            return res.status(416).send('Part index out of range.');
          }
          const start = partIdx * ISAAC_PORTABLE_PART_SIZE;
          const end = Math.min(stat.size, start + ISAAC_PORTABLE_PART_SIZE) - 1;
          res.status(200);
          res.setHeader('X-Part-Count', String(partCount));
          res.setHeader('X-Total-Bytes', String(stat.size));
          res.setHeader('Content-Length', String(end - start + 1));
          return fs.createReadStream(cachedChunkPath, { start, end }).pipe(res);
        }
      }
    } catch {}

    // Fast-path while cold: warm whole chunk in background, stream this <=3 MB Range part immediately
    warmChunkToDisk(file, vParam, safeV).catch(() => {});
    const pStart = partIdx * ISAAC_PORTABLE_PART_SIZE;
    const pEnd = pStart + ISAAC_PORTABLE_PART_SIZE - 1;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30000);
    res.on('close', () => {
      if (!res.writableEnded) ac.abort();
    });
    try {
      const upstream = await fetch(`${ISAAC_UPSTREAM_BASE}/c/${file}${vParam}`, {
        signal: ac.signal,
        headers: { ...ISAAC_UPSTREAM_HEADERS, Range: `bytes=${pStart}-${pEnd}` },
      });
      clearTimeout(timer);
      if (upstream.status === 416) {
        return res.status(416).send('Part index out of range.');
      }
      if (!upstream.ok && upstream.status !== 206) {
        return res.status(502).send(`Upstream part HTTP ${upstream.status}`);
      }
      const cr = upstream.headers.get('content-range') || '';
      const totalMatch = /\/(\d+)\s*$/.exec(cr);
      const buf = Buffer.from(await upstream.arrayBuffer());
      const totalSize = totalMatch ? Number(totalMatch[1]) : (upstream.status === 200 ? buf.length : 0);
      const out = upstream.status === 200 && buf.length > ISAAC_PORTABLE_PART_SIZE
        ? buf.subarray(pStart, pEnd + 1)
        : buf;
      if (totalSize > 0) {
        const partCount = Math.max(1, Math.ceil(totalSize / ISAAC_PORTABLE_PART_SIZE));
        res.setHeader('X-Part-Count', String(partCount));
        res.setHeader('X-Total-Bytes', String(totalSize));
      }
      res.status(200);
      res.setHeader('Content-Length', String(out.length));
      return res.send(out);
    } catch {
      clearTimeout(timer);
      if (!res.headersSent) return res.status(502).send('Failed to stream chunk part.');
      return res.end();
    }
  });

  app.get('/api/isaac-game/c/:file', async (req, res) => {
    const file = String(req.params.file || '').trim();
    if (!/^[ab]\d{1,3}\.bin$/.test(file)) {
      return res.status(400).send('Invalid Isaac chunk filename.');
    }

    const vParam = typeof req.query.v === 'string' && /^[a-f0-9]{4,16}$/i.test(req.query.v) ? `?v=${req.query.v}` : '';
    const safeV = typeof req.query.v === 'string' && /^[a-f0-9]{4,16}$/i.test(req.query.v) ? req.query.v : 'nov';
    const cachedChunkPath = path.join(ISAAC_CHUNKS_CACHE_DIR, `${file}.${safeV}`);

    // Serve immediately from SSD cache (<1ms) if this chunk (a* or b*) is already cached
    try {
      if (fs.existsSync(cachedChunkPath)) {
        const stat = fs.statSync(cachedChunkPath);
        if (stat.size > 0) {
          return serveCachedChunkFile(req, res, cachedChunkPath, stat.size);
        }
      }
    } catch {}

    // If a real data Range slice (not a tiny 64-byte probe) hits an uncached chunk, warm the full chunk in background
    const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range.trim() : '';
    if (rangeHeader && rangeHeader !== 'bytes=0-63') {
      warmChunkToDisk(file, vParam, safeV).catch(() => {});
    }

    const targetUrl = `${ISAAC_UPSTREAM_BASE}/c/${file}${vParam}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30000);
    res.on('close', () => {
      if (!res.writableEnded) ac.abort();
    });

    try {
      const upstreamHeaders: Record<string, string> = {};
      if (rangeHeader) {
        upstreamHeaders['Range'] = rangeHeader;
      }
      const upstream = await fetch(targetUrl, {
        signal: ac.signal,
        headers: upstreamHeaders,
      });
      clearTimeout(timer);

      if (!upstream.ok && upstream.status !== 206) {
        return res.status(upstream.status).send(`Chunk upstream returned ${upstream.status}`);
      }

      if (!rangeHeader && upstream.status === 200) {
        const buf = Buffer.from(await upstream.arrayBuffer());
        const tmpPath = `${cachedChunkPath}.${process.pid}.${Date.now()}.tmp`;
        try {
          fs.writeFileSync(tmpPath, buf);
          fs.renameSync(tmpPath, cachedChunkPath);
        } catch {
          try {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
          } catch {}
        }
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', String(buf.length));
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Vary', 'Range');
        res.setHeader('Cache-Control', 'public, max-age=86400, no-transform');
        return res.send(buf);
      }

      res.status(upstream.status);
      for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
        const val = upstream.headers.get(h);
        if (val) res.setHeader(h, val);
      }
      res.setHeader('Vary', 'Range');
      res.setHeader('Cache-Control', 'public, max-age=86400, no-transform');

      if (!upstream.body) {
        return res.end();
      }
      const nodeStream = Readable.fromWeb(upstream.body as any);
      nodeStream.on('error', () => {
        if (!res.headersSent) res.status(502).end();
        else res.end();
      });
      return nodeStream.pipe(res);
    } catch (err: any) {
      clearTimeout(timer);
      if (!res.headersSent) {
        return res.status(502).send('Failed to stream Isaac chunk.');
      }
      return res.end();
    }
  });

  // ============================================================================
  // MULTI-SITE AD-FREE MUSIC AGGREGATOR (/api/music/*)
  // Aggregates live playable tracks & links from YouTube Music, Spotify,
  // SoundCloud, Audius, Apple Music, and Deezer.
  // ============================================================================
  type MusicSource =
    | 'ytmusic'
    | 'spotify'
    | 'soundcloud'
    | 'audius'
    | 'apple'
    | 'deezer'
    | 'youtube'
    | 'direct';

  interface ServerMusicTrack {
    id: string;
    title: string;
    artist: string;
    album?: string;
    artwork?: string;
    durationSec: number;
    source: MusicSource;
    sourceName: string;
    sourceUrl: string;
    playbackType: 'youtube' | 'soundcloud' | 'audio' | 'resolve';
    playbackId?: string;
    streamUrl?: string;
    previewUrl?: string;
  }

  const MUSIC_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

  function parseDurationStr(text?: string): number {
    if (!text) return 0;
    const parts = String(text)
      .trim()
      .split(':')
      .map((n) => parseInt(n, 10));
    if (parts.some((n) => Number.isNaN(n))) return 0;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  }

  const musicSearchCache = new Map<string, { at: number; tracks: ServerMusicTrack[] }>();
  const spotifyArtCache = new Map<string, string>();
  let cachedSpotifyPlaylists: { at: number; tracks: ServerMusicTrack[] } | null = null;
  let cachedScClientId: { id: string; at: number } | null = null;

  async function fetchJsonWithTimeout(url: string, headers: Record<string, string> = {}, timeoutMs = 7000): Promise<any> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: ac.signal, headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchTextWithTimeout(url: string, headers: Record<string, string> = {}, timeoutMs = 8000): Promise<string> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: ac.signal, headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } finally {
      clearTimeout(timer);
    }
  }

  async function getSoundCloudClientId(forceRefresh = false): Promise<string | null> {
    if (!forceRefresh && cachedScClientId && Date.now() - cachedScClientId.at < 3600_000) {
      return cachedScClientId.id;
    }
    try {
      const html = await fetchTextWithTimeout('https://soundcloud.com/discover', { 'User-Agent': MUSIC_UA });
      const scripts = [...html.matchAll(/https:\/\/a-v2\.sndcdn\.com\/assets\/[^"'\s]+\.js/g)].map((m) => m[0]);
      for (let i = scripts.length - 1; i >= Math.max(0, scripts.length - 4); i--) {
        try {
          const js = await fetchTextWithTimeout(scripts[i], { 'User-Agent': MUSIC_UA }, 6000);
          const m = js.match(/client_id:"([a-zA-Z0-9]{20,40})"/);
          if (m) {
            cachedScClientId = { id: m[1], at: Date.now() };
            return m[1];
          }
        } catch {}
      }
    } catch {}
    return null;
  }

  async function searchYouTubeWeb(query: string, limit = 10): Promise<ServerMusicTrack[]> {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 7000);
      const r = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
        method: 'POST',
        signal: ac.signal,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': MUSIC_UA,
          'Accept-Language': 'en-US,en;q=0.9',
        },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion: '2.20240724.00.00', hl: 'en', gl: 'US' } },
          query,
        }),
      });
      clearTimeout(timer);
      if (!r.ok) return [];
      const data: any = await r.json();
      const sections =
        data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
      const out: ServerMusicTrack[] = [];
      for (const sec of sections) {
        const items = sec?.itemSectionRenderer?.contents || [];
        for (const it of items) {
          const v = it?.videoRenderer;
          if (!v || !v.videoId) continue;
          const durationSec = parseDurationStr(v.lengthText?.simpleText);
          if (durationSec <= 0 || durationSec > 1200) continue;
          const title = v.title?.runs?.map((run: any) => run.text).join('') || 'Unknown Track';
          const rawArtist = v.ownerText?.runs?.[0]?.text || 'YouTube Music';
          const artist = rawArtist.replace(/\s*-\s*Topic$/i, '').trim();
          out.push({
            id: `ytmusic:${v.videoId}`,
            title,
            artist,
            artwork: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
            durationSec,
            source: 'ytmusic',
            sourceName: 'YouTube Music',
            sourceUrl: `https://music.youtube.com/watch?v=${v.videoId}`,
            playbackType: 'youtube',
            playbackId: v.videoId,
          });
          if (out.length >= limit) return out;
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  async function searchYouTubeMusic(query: string, limit = 10): Promise<ServerMusicTrack[]> {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 7000);
      const r = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
        method: 'POST',
        signal: ac.signal,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': MUSIC_UA,
          Origin: 'https://music.youtube.com',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240724.01.00', hl: 'en', gl: 'US' } },
          query,
          params: 'EgWKAQIIAWoMEAMQBBAJEAoQBRAV',
        }),
      });
      clearTimeout(timer);
      if (!r.ok) return searchYouTubeWeb(query, limit);
      const data: any = await r.json();
      const tabs =
        data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      const out: ServerMusicTrack[] = [];
      for (const sec of tabs) {
        const items = sec?.musicShelfRenderer?.contents || [];
        for (const it of items) {
          const m = it?.musicResponsiveListItemRenderer;
          if (!m) continue;
          const vid =
            m?.playlistItemData?.videoId ||
            m?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
          if (!vid) continue;
          const cols: string[] = (m?.flexColumns || []).map((c: any) =>
            (c?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []).map((x: any) => x.text).join('')
          );
          const title = (cols[0] || '').trim();
          if (!title) continue;
          const metaParts = (cols[1] || '').split('•').map((s) => s.trim()).filter(Boolean);
          const artist = metaParts[0] || 'YouTube Music';
          const lastMeta = metaParts[metaParts.length - 1] || '';
          const durationSec = /^\d+:\d{2}/.test(lastMeta) ? parseDurationStr(lastMeta) : 0;
          const album = metaParts.length >= 3 && /^\d+:\d{2}/.test(lastMeta) ? metaParts[1] : undefined;
          const thumbs: any[] = m?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
          const artwork = thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
          out.push({
            id: `ytmusic:${vid}`,
            title,
            artist,
            ...(album ? { album } : {}),
            artwork,
            durationSec,
            source: 'ytmusic',
            sourceName: 'YouTube Music',
            sourceUrl: `https://music.youtube.com/watch?v=${vid}`,
            playbackType: 'youtube',
            playbackId: vid,
          });
          if (out.length >= limit) return out;
        }
      }
      return out.length > 0 ? out : searchYouTubeWeb(query, limit);
    } catch {
      return searchYouTubeWeb(query, limit);
    }
  }

  async function searchSoundCloud(query: string, limit = 10): Promise<ServerMusicTrack[]> {
    try {
      let clientId = await getSoundCloudClientId();
      if (!clientId) return [];
      const url = (cid: string) =>
        `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&limit=${limit}&client_id=${cid}`;
      let data: any;
      try {
        data = await fetchJsonWithTimeout(url(clientId), { 'User-Agent': MUSIC_UA });
      } catch {
        clientId = await getSoundCloudClientId(true);
        if (!clientId) return [];
        data = await fetchJsonWithTimeout(url(clientId), { 'User-Agent': MUSIC_UA });
      }
      const list = Array.isArray(data?.collection) ? data.collection : [];
      return list
        .filter((t: any) => t?.permalink_url && t?.title && t?.policy !== 'BLOCK')
        .slice(0, limit)
        .map((t: any) => {
          const isSnippetOnly =
            t.policy === 'SNIP' ||
            (t.monetization_model === 'SUB_HIGH_TIER' && t.policy !== 'ALLOW');
          return {
            id: `soundcloud:${t.id}`,
            title: String(t.title),
            artist: String(t.user?.username || 'SoundCloud Artist'),
            artwork: t.artwork_url
              ? String(t.artwork_url).replace('-large.', '-t500x500.')
              : t.user?.avatar_url
                ? String(t.user.avatar_url).replace('-large.', '-t500x500.')
                : undefined,
            durationSec: Math.round((Number(t.duration) || 0) / 1000),
            source: 'soundcloud' as MusicSource,
            sourceName: 'SoundCloud',
            sourceUrl: String(t.permalink_url),
            playbackType: isSnippetOnly ? ('resolve' as const) : ('soundcloud' as const),
            playbackId: String(t.permalink_url),
          };
        });
    } catch {
      return [];
    }
  }

  async function searchAudius(query?: string, limit = 10): Promise<ServerMusicTrack[]> {
    try {
      const endpoint = query
        ? `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=AtlasMusic`
        : `https://discoveryprovider.audius.co/v1/tracks/trending?time=week&app_name=AtlasMusic`;
      const data = await fetchJsonWithTimeout(endpoint);
      const list = Array.isArray(data?.data) ? data.data : [];
      return list
        .filter((t: any) => t?.id && t?.title)
        .slice(0, limit)
        .map((t: any) => ({
          id: `audius:${t.id}`,
          title: String(t.title),
          artist: String(t.user?.name || t.user?.handle || 'Audius Artist'),
          album: t.genre ? String(t.genre) : undefined,
          artwork: t.artwork?.['480x480'] || t.artwork?.['150x150'] || undefined,
          durationSec: Number(t.duration) || 0,
          source: 'audius' as MusicSource,
          sourceName: 'Audius',
          sourceUrl: t.permalink ? `https://audius.co${t.permalink}` : `https://audius.co/tracks/${t.id}`,
          playbackType: 'audio' as const,
          streamUrl: `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(t.id)}/stream?app_name=AtlasMusic`,
        }));
    } catch {
      return [];
    }
  }

  async function enrichSpotifyArtwork(trackId: string): Promise<string | undefined> {
    if (spotifyArtCache.has(trackId)) return spotifyArtCache.get(trackId);
    try {
      const o = await fetchJsonWithTimeout(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${trackId}`)}`,
        { 'User-Agent': MUSIC_UA },
        4000
      );
      if (o?.thumbnail_url) {
        spotifyArtCache.set(trackId, String(o.thumbnail_url));
        return String(o.thumbnail_url);
      }
    } catch {}
    return undefined;
  }

  async function fetchSpotifyEmbedCollection(kind: 'playlist' | 'album' | 'track', id: string): Promise<{
    name?: string;
    tracks: ServerMusicTrack[];
  }> {
    const html = await fetchTextWithTimeout(
      `https://open.spotify.com/embed/${kind}/${encodeURIComponent(id)}`,
      { 'User-Agent': MUSIC_UA }
    );
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return { tracks: [] };
    const nextData = JSON.parse(m[1]);
    const entity = nextData?.props?.pageProps?.state?.data?.entity;
    if (!entity) return { tracks: [] };

    const defaultCover =
      entity.visualIdentity?.image?.[0]?.url ||
      entity.coverArt?.sources?.[0]?.url ||
      undefined;

    if (kind === 'track') {
      const spId = String(entity.id || id);
      const art = defaultCover || (await enrichSpotifyArtwork(spId));
      return {
        name: entity.name,
        tracks: [
          {
            id: `spotify:${spId}`,
            title: String(entity.name || 'Spotify Track'),
            artist: Array.isArray(entity.artists)
              ? entity.artists.map((a: any) => a.name).filter(Boolean).join(', ')
              : String(entity.subtitle || 'Spotify Artist'),
            artwork: art,
            durationSec: Math.round((Number(entity.duration) || 0) / 1000),
            source: 'spotify',
            sourceName: 'Spotify',
            sourceUrl: `https://open.spotify.com/track/${spId}`,
            playbackType: 'resolve',
            previewUrl: entity.audioPreview?.url ? String(entity.audioPreview.url) : undefined,
          },
        ],
      };
    }

    const list = Array.isArray(entity.trackList) ? entity.trackList : [];
    const tracks: ServerMusicTrack[] = [];
    for (const item of list) {
      const uri = String(item?.uri || '');
      const spId = uri.startsWith('spotify:track:') ? uri.slice('spotify:track:'.length) : '';
      if (!spId || !item?.title) continue;
      tracks.push({
        id: `spotify:${spId}`,
        title: String(item.title),
        artist: String(item.subtitle || 'Spotify Artist').replace(/\u00a0/g, ' '),
        album: entity.name ? String(entity.name) : undefined,
        artwork: spotifyArtCache.get(spId) || defaultCover,
        durationSec: Math.round((Number(item.duration) || 0) / 1000),
        source: 'spotify',
        sourceName: 'Spotify',
        sourceUrl: `https://open.spotify.com/track/${spId}`,
        playbackType: 'resolve',
        previewUrl: item.audioPreview?.url ? String(item.audioPreview.url) : undefined,
      });
    }
    return { name: entity.name ? String(entity.name) : undefined, tracks };
  }

  async function getSpotifyPoolTracks(): Promise<ServerMusicTrack[]> {
    if (cachedSpotifyPlaylists && Date.now() - cachedSpotifyPlaylists.at < 1800_000) {
      return cachedSpotifyPlaylists.tracks;
    }
    const playlistIds = [
      '37i9dQZF1DXcBWIGoYBM5M', // Today's Top Hits
      '37i9dQZEVXbMDoHDwVN2tF', // Top 50 Global
      '37i9dQZF1DWWQRwui0ExPn', // lofi beats
      '37i9dQZF1DX0XUsuxWHRQd', // RapCaviar
      '37i9dQZF1DX1spT6G94GFC', // 80s Hits
    ];
    const results = await Promise.all(
      playlistIds.map((pid) => fetchSpotifyEmbedCollection('playlist', pid).catch(() => ({ tracks: [] })))
    );
    const seen = new Set<string>();
    const combined: ServerMusicTrack[] = [];
    for (const r of results) {
      for (const t of r.tracks) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        combined.push(t);
      }
    }
    // Enrich cover art for top 16 Spotify tracks in background
    Promise.all(
      combined.slice(0, 16).map(async (t) => {
        const spId = t.id.replace('spotify:', '');
        const art = await enrichSpotifyArtwork(spId);
        if (art) t.artwork = art;
      })
    ).catch(() => {});

    cachedSpotifyPlaylists = { at: Date.now(), tracks: combined };
    return combined;
  }

  let spotifyRuntimeConfig: {
    secret: string;
    totpVer: string;
    searchTracksHash: string;
    refreshedAt: number;
  } = {
    secret: ',7/*F("rLJ2oxaKL^f+E1xvP@N',
    totpVer: '61',
    searchTracksHash: 'b02683192a98dde7966b5e6655a79eeb62713eab703eda9902c932818dd52751',
    refreshedAt: 0,
  };
  let cachedSpotifySession: {
    accessToken: string;
    clientToken: string;
    expiresAt: number;
  } | null = null;

  function generateSpotifyTotp(secretStr: string, timestampMs: number): string {
    const transformed = secretStr.split('').map((c, idx) => c.charCodeAt(0) ^ ((idx % 33) + 9));
    const key = Buffer.from(transformed.join(''), 'utf8');
    const counter = Math.floor(timestampMs / 1000 / 30);
    const msg = Buffer.alloc(8);
    msg.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', key).update(msg).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    return String(code % 1_000_000).padStart(6, '0');
  }

  async function refreshSpotifyRuntimeConfig(): Promise<void> {
    if (Date.now() - spotifyRuntimeConfig.refreshedAt < 300_000) return;
    try {
      const html = await fetchTextWithTimeout('https://open.spotify.com/', { 'User-Agent': MUSIC_UA }, 7000);
      const wpMatch = html.match(/https:\/\/open\.spotifycdn\.com\/cdn\/build\/web-player\/web-player\.[a-f0-9]+\.js/);
      if (wpMatch) {
        const wpJs = await fetchTextWithTimeout(wpMatch[0], { 'User-Agent': MUSIC_UA }, 8000);
        const secMatch = wpJs.match(/\{secret:(?:'([^']+)'|"([^"]+)"),version:(\d+)\}/);
        if (secMatch) {
          spotifyRuntimeConfig.secret = secMatch[1] || secMatch[2];
          spotifyRuntimeConfig.totpVer = secMatch[3];
        }
      }
      const cdnMatch = html.match(/id="__CDN_FILE_URLS__"[^>]*>([^<]+)</);
      if (cdnMatch) {
        const map = JSON.parse(Buffer.from(cdnMatch[1], 'base64').toString('utf8'));
        const searchKey = Object.keys(map).find((k) => /xpui-routes-search\.[a-f0-9]+\.js$/i.test(k));
        if (searchKey && map[searchKey]) {
          const searchJs = await fetchTextWithTimeout(map[searchKey], { 'User-Agent': MUSIC_UA }, 7000);
          const hashMatch = searchJs.match(/"searchTracks","query","([a-f0-9]{64})"/);
          if (hashMatch) {
            spotifyRuntimeConfig.searchTracksHash = hashMatch[1];
          }
        }
      }
      spotifyRuntimeConfig.refreshedAt = Date.now();
    } catch {}
  }

  async function getSpotifyPathfinderAuth(forceRefresh = false): Promise<{
    accessToken: string;
    clientToken: string;
  }> {
    if (!forceRefresh && cachedSpotifySession && Date.now() < cachedSpotifySession.expiresAt - 60_000) {
      return {
        accessToken: cachedSpotifySession.accessToken,
        clientToken: cachedSpotifySession.clientToken,
      };
    }

    if (forceRefresh) {
      await refreshSpotifyRuntimeConfig();
    }

    const st = await fetchJsonWithTimeout(
      'https://open.spotify.com/api/server-time',
      { 'User-Agent': MUSIC_UA },
      5000
    );
    const serverTimeMs = (Number(st?.serverTime) || Math.floor(Date.now() / 1000)) * 1000;
    const params = new URLSearchParams({
      reason: 'init',
      productType: 'web-player',
      totp: generateSpotifyTotp(spotifyRuntimeConfig.secret, Date.now()),
      totpServer: generateSpotifyTotp(spotifyRuntimeConfig.secret, serverTimeMs),
      totpVer: spotifyRuntimeConfig.totpVer,
    });
    const tok = await fetchJsonWithTimeout(
      `https://open.spotify.com/api/token?${params.toString()}`,
      { 'User-Agent': MUSIC_UA, Referer: 'https://open.spotify.com/' },
      6000
    );
    if (!tok?.accessToken || !tok?.clientId) {
      throw new Error('Failed to obtain Spotify session token');
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 6000);
    let ctToken = '';
    try {
      const ctRes = await fetch('https://clienttoken.spotify.com/v1/clienttoken', {
        method: 'POST',
        signal: ac.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': MUSIC_UA,
        },
        body: JSON.stringify({
          client_data: {
            client_version: '1.2.46.25.g7f189073',
            client_id: tok.clientId,
            js_sdk_data: {
              device_brand: 'unknown',
              device_model: 'unknown',
              os: 'windows',
              os_version: 'NT 10.0',
              device_id: `atlas-${Date.now()}`,
              device_type: 'computer',
            },
          },
        }),
      });
      const ctData: any = await ctRes.json();
      ctToken = String(ctData?.granted_token?.token || '');
    } finally {
      clearTimeout(timer);
    }

    if (!ctToken) {
      throw new Error('Failed to obtain Spotify client token');
    }

    cachedSpotifySession = {
      accessToken: String(tok.accessToken),
      clientToken: ctToken,
      expiresAt: Number(tok.accessTokenExpirationTimestampMs) || Date.now() + 1800_000,
    };
    return {
      accessToken: cachedSpotifySession.accessToken,
      clientToken: cachedSpotifySession.clientToken,
    };
  }

  async function searchSpotify(query: string, limit = 15): Promise<ServerMusicTrack[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    const executePathfinder = async (forceRefresh: boolean) => {
      const auth = await getSpotifyPathfinderAuth(forceRefresh);
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 7000);
      try {
        const res = await fetch('https://api-partner.spotify.com/pathfinder/v2/query', {
          method: 'POST',
          signal: ac.signal,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${auth.accessToken}`,
            'client-token': auth.clientToken,
            'app-platform': 'WebPlayer',
            'spotify-app-version': '1.2.46.25.g7f189073',
            'User-Agent': MUSIC_UA,
          },
          body: JSON.stringify({
            variables: {
              searchTerm: cleanQuery,
              offset: 0,
              limit,
              numberOfTopResults: 5,
              includeAudiobooks: false,
              includePreReleases: false,
              includeAuthors: false,
            },
            operationName: 'searchTracks',
            extensions: {
              persistedQuery: {
                version: 1,
                sha256Hash: spotifyRuntimeConfig.searchTracksHash,
              },
            },
          }),
        });
        if (!res.ok) {
          throw new Error(`Spotify Pathfinder HTTP ${res.status}`);
        }
        return await res.json();
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      let json: any;
      try {
        json = await executePathfinder(false);
      } catch {
        cachedSpotifySession = null;
        json = await executePathfinder(true);
      }

      const items = json?.data?.searchV2?.tracksV2?.items;
      if (Array.isArray(items) && items.length > 0) {
        const tracks: ServerMusicTrack[] = [];
        for (const entry of items) {
          const d = entry?.item?.data;
          const spId = String(d?.id || '');
          if (!spId || !d?.name) continue;
          const artists = Array.isArray(d.artists?.items)
            ? d.artists.items
                .map((a: any) => a?.profile?.name)
                .filter(Boolean)
                .join(', ')
            : 'Spotify Artist';
          const artSources: any[] = d.albumOfTrack?.coverArt?.sources || [];
          const bestArt =
            artSources.find((s) => Number(s?.width) >= 300)?.url ||
            artSources[0]?.url ||
            undefined;
          if (bestArt) spotifyArtCache.set(spId, bestArt);
          tracks.push({
            id: `spotify:${spId}`,
            title: String(d.name),
            artist: artists || 'Spotify Artist',
            album: d.albumOfTrack?.name ? String(d.albumOfTrack.name) : undefined,
            artwork: bestArt,
            durationSec: Math.round((Number(d.duration?.totalMilliseconds) || 0) / 1000),
            source: 'spotify',
            sourceName: 'Spotify',
            sourceUrl: `https://open.spotify.com/track/${spId}`,
            playbackType: 'resolve',
          });
          if (tracks.length >= limit) break;
        }
        if (tracks.length > 0) return tracks;
      }
    } catch {}

    // Fallback to Spotify playlist pool if live Pathfinder search is temporarily unavailable
    const pool = await getSpotifyPoolTracks().catch(() => []);
    const q = cleanQuery.toLowerCase();
    return pool
      .filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          (t.album || '').toLowerCase().includes(q)
      )
      .slice(0, limit);
  }

  async function searchDeezer(query: string, limit = 8): Promise<ServerMusicTrack[]> {
    try {
      const data = await fetchJsonWithTimeout(
        `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit}`
      );
      const list = Array.isArray(data?.data) ? data.data : [];
      return list
        .filter((t: any) => t?.id && t?.title)
        .map((t: any) => ({
          id: `deezer:${t.id}`,
          title: String(t.title),
          artist: String(t.artist?.name || 'Deezer Artist'),
          album: t.album?.title ? String(t.album.title) : undefined,
          artwork: t.album?.cover_big || t.album?.cover_medium || undefined,
          durationSec: Number(t.duration) || 0,
          source: 'deezer' as MusicSource,
          sourceName: 'Deezer',
          sourceUrl: String(t.link || `https://www.deezer.com/track/${t.id}`),
          playbackType: 'resolve' as const,
          previewUrl: t.preview ? String(t.preview) : undefined,
        }));
    } catch {
      return [];
    }
  }

  async function searchAppleMusic(query: string, limit = 8): Promise<ServerMusicTrack[]> {
    try {
      const data = await fetchJsonWithTimeout(
        `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${limit}`
      );
      const list = Array.isArray(data?.results) ? data.results : [];
      return list
        .filter((t: any) => t?.trackId && t?.trackName)
        .map((t: any) => ({
          id: `apple:${t.trackId}`,
          title: String(t.trackName),
          artist: String(t.artistName || 'Apple Music Artist'),
          album: t.collectionName ? String(t.collectionName) : undefined,
          artwork: t.artworkUrl100 ? String(t.artworkUrl100).replace('100x100bb', '400x400bb') : undefined,
          durationSec: Math.round((Number(t.trackTimeMillis) || 0) / 1000),
          source: 'apple' as MusicSource,
          sourceName: 'Apple Music',
          sourceUrl: String(t.trackViewUrl || 'https://music.apple.com'),
          playbackType: 'resolve' as const,
          previewUrl: t.previewUrl ? String(t.previewUrl) : undefined,
        }));
    } catch {
      return [];
    }
  }

  function interleaveTracks(buckets: ServerMusicTrack[][]): ServerMusicTrack[] {
    const out: ServerMusicTrack[] = [];
    const maxLen = Math.max(0, ...buckets.map((b) => b.length));
    for (let i = 0; i < maxLen; i++) {
      for (const b of buckets) {
        if (b[i]) out.push(b[i]);
      }
    }
    return out;
  }

  app.get('/api/music/discover', async (_req, res) => {
    const cacheKey = '__discover__';
    const hit = musicSearchCache.get(cacheKey);
    if (hit && Date.now() - hit.at < 600_000) {
      return res.json({ tracks: hit.tracks });
    }
    try {
      const [yt, sc, audius, spotifyPool, deezer, apple] = await Promise.all([
        searchYouTubeMusic('official audio synthwave indie chill', 6),
        searchSoundCloud('electronic chillwave synth', 6),
        searchAudius(undefined, 8),
        getSpotifyPoolTracks().catch(() => []),
        searchDeezer('Daft Punk', 5),
        searchAppleMusic('Tame Impala', 5),
      ]);

      const spSlice = spotifyPool.slice(0, 8);
      await Promise.all(
        spSlice.map(async (t) => {
          const spId = t.id.replace('spotify:', '');
          const art = await enrichSpotifyArtwork(spId);
          if (art) t.artwork = art;
        })
      );

      const tracks = interleaveTracks([spSlice, yt, sc, audius, apple, deezer]);
      musicSearchCache.set(cacheKey, { at: Date.now(), tracks });
      return res.json({ tracks });
    } catch {
      return res.json({ tracks: [] });
    }
  });

  app.get('/api/music/search', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const source = typeof req.query.source === 'string' ? req.query.source.trim().toLowerCase() : 'all';
    if (!q) {
      return res.json({ tracks: [] });
    }
    const cacheKey = `${source}:${q.toLowerCase()}`;
    const hit = musicSearchCache.get(cacheKey);
    if (hit && Date.now() - hit.at < 300_000) {
      return res.json({ tracks: hit.tracks });
    }

    try {
      const tasks: Promise<ServerMusicTrack[]>[] = [];
      if (source === 'all' || source === 'ytmusic' || source === 'youtube') {
        tasks.push(searchYouTubeMusic(q, source === 'all' ? 8 : 15));
      }
      if (source === 'all' || source === 'soundcloud') {
        tasks.push(searchSoundCloud(q, source === 'all' ? 7 : 15));
      }
      if (source === 'all' || source === 'audius') {
        tasks.push(searchAudius(q, source === 'all' ? 6 : 15));
      }
      if (source === 'all' || source === 'spotify') {
        tasks.push(searchSpotify(q, source === 'all' ? 8 : 20));
      }
      if (source === 'all' || source === 'deezer') {
        tasks.push(searchDeezer(q, source === 'all' ? 5 : 12));
      }
      if (source === 'all' || source === 'apple') {
        tasks.push(searchAppleMusic(q, source === 'all' ? 5 : 12));
      }

      const buckets = await Promise.all(tasks);
      const tracks = interleaveTracks(buckets);
      musicSearchCache.set(cacheKey, { at: Date.now(), tracks });
      return res.json({ tracks });
    } catch {
      return res.status(502).json({ error: 'Unable to search music sources right now.' });
    }
  });

  const PLACEHOLDER_ARTIST_NAMES = new Set([
    'spotify',
    'spotify artist',
    'youtube',
    'youtube music',
    'soundcloud',
    'soundcloud artist',
    'apple music',
    'apple music artist',
    'deezer',
    'deezer artist',
    'audius',
    'audius artist',
    'unknown',
    'various artists',
  ]);

  const VERSION_QUALIFIERS = [
    'remix',
    'cover',
    'karaoke',
    'instrumental',
    'slowed',
    'reverb',
    'nightcore',
    'sped up',
    'sped',
    '8d',
    'mashup',
    'reaction',
    'parody',
    'teaser',
    'trailer',
    'snippet',
    'loop',
    '1 hour',
    'acoustic',
    'live',
    'edit',
    'bootleg',
    'flip',
    'rework',
    'type beat',
    'pitched',
    'vip',
    'demo',
    'tribute',
    'ringtone',
  ];

  function hasWholeWordPhrase(normalizedHaystack: string, phrase: string): boolean {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^| )${escaped}(?: |$)`).test(normalizedHaystack);
  }

  function normalizeMusicText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function stripMusicNoiseTags(title: string): string {
    return title
      .replace(/\s*[\(\[][^)\]]*(?:official|audio|video|lyric|lyrics|hd|4k|hq|visualizer|feat\.?|ft\.?)[^)\]]*[\)\]]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanArtistForSearch(artist: string): string {
    const trimmed = artist.trim();
    if (!trimmed || PLACEHOLDER_ARTIST_NAMES.has(trimmed.toLowerCase())) return '';
    return trimmed;
  }

  function extractPrimaryArtists(artist: string): string[] {
    const clean = cleanArtistForSearch(artist);
    if (!clean) return [];
    return clean
      .split(/\s*(?:,|&|\/|\bx\b|\bfeat\.?\b|\bft\.?\b|\bwith\b)\s*/i)
      .map((a) => normalizeMusicText(a).replace(/(?:vevo|official|topic)$/i, '').trim())
      .filter((a) => a.length >= 2);
  }

  function scoreStreamCandidate(
    candidate: ServerMusicTrack,
    reqTitle: string,
    reqArtist: string,
    expectedDurationSec: number
  ): number {
    const reqBaseNorm = normalizeMusicText(stripMusicNoiseTags(reqTitle)) || normalizeMusicText(reqTitle);
    const reqFullNorm = normalizeMusicText(reqTitle);
    const candTitleFull = normalizeMusicText(candidate.title);
    const candTitleBase = normalizeMusicText(stripMusicNoiseTags(candidate.title)) || candTitleFull;
    const candArtistNorm = normalizeMusicText(candidate.artist).replace(/(?:vevo|official|topic)$/i, '').trim();
    const candCombined = `${candTitleFull} ${candArtistNorm}`.trim();
    const candCombinedCompact = candCombined.replace(/\s+/g, '');

    if (!reqBaseNorm || !candTitleFull) return -999;

    // Strict duration sanity check when expected duration is known
    if (expectedDurationSec > 0 && candidate.durationSec > 0) {
      const ratio = candidate.durationSec / expectedDurationSec;
      if (ratio < 0.45 || ratio > 2.2) {
        return -999;
      }
    }

    let score = 0;

    // 1. Title similarity
    const reqTokens = reqBaseNorm.split(' ').filter((w) => w.length >= 2 || /^\d+$/.test(w));
    if (candTitleBase === reqBaseNorm || candTitleFull === reqBaseNorm) {
      score += 60;
    } else if (candTitleBase.includes(reqBaseNorm) || (candTitleBase.length >= 4 && reqBaseNorm.includes(candTitleBase))) {
      score += 45;
    } else if (reqTokens.length > 0) {
      const candWords = new Set(candTitleFull.split(' '));
      let matched = 0;
      for (const tok of reqTokens) {
        if (candWords.has(tok) || candTitleFull.includes(tok)) matched += 1;
      }
      const coverage = matched / reqTokens.length;
      if (coverage < 0.6) return -999;
      score += Math.round(coverage * 40);
    } else {
      return -999;
    }

    // 2. Penalize unsolicited version qualifiers (covers, edits, bootlegs, slowed, remixes, etc.)
    for (const q of VERSION_QUALIFIERS) {
      const reqWants = hasWholeWordPhrase(reqFullNorm, q);
      const candHas = hasWholeWordPhrase(candTitleFull, q) || hasWholeWordPhrase(candArtistNorm, q);
      if (!reqWants && candHas) {
        score -= 75;
      }
    }

    // 3. Artist match (check candidate artist AND candidate title since YouTube titles include artist)
    const artists = extractPrimaryArtists(reqArtist);
    if (artists.length > 0) {
      let bestArtistMatch = 0;
      for (const a of artists) {
        const aCompact = a.replace(/\s+/g, '');
        if (
          candArtistNorm === a ||
          candArtistNorm.includes(a) ||
          candTitleFull.includes(a) ||
          (aCompact.length >= 4 && candCombinedCompact.includes(aCompact))
        ) {
          bestArtistMatch = Math.max(bestArtistMatch, 45);
          break;
        }
        const aTokens = a.split(' ').filter((w) => w.length >= 2);
        if (aTokens.length > 0) {
          const hits = aTokens.filter((tok) => candCombined.includes(tok)).length;
          if (hits === aTokens.length) {
            bestArtistMatch = Math.max(bestArtistMatch, 35);
          } else if (hits > 0) {
            bestArtistMatch = Math.max(bestArtistMatch, 15);
          }
        }
      }
      if (bestArtistMatch === 0) {
        return -999;
      }
      score += bestArtistMatch;
    }

    // 4. Duration closeness bonus/penalty
    if (expectedDurationSec > 0 && candidate.durationSec > 0) {
      const diff = Math.abs(candidate.durationSec - expectedDurationSec);
      if (diff <= 4) score += 45;
      else if (diff <= 12) score += 30;
      else if (diff <= 22) score += 15;
      else if (diff <= 35) score += 0;
      else if (diff <= 60) score -= 40;
      else return -999;
    }

    // 5. Prefer official album audio / topic / lyric uploads over music videos with long skits
    if (candidate.playbackType === 'youtube') {
      if (candTitleFull.includes('official audio') || candTitleFull.includes('audio') || candTitleFull.includes('lyrics')) {
        score += 14;
      }
      if (candTitleFull.includes('official music video') || candTitleFull.includes('music video')) {
        score -= 10;
      }
    }

    return score;
  }

  const ytEmbeddableCache = new Map<string, { ok: boolean; at: number }>();
  async function isYouTubeEmbeddable(videoId: string): Promise<boolean> {
    const cached = ytEmbeddableCache.get(videoId);
    if (cached && Date.now() - cached.at < 3600_000) {
      return cached.ok;
    }
    try {
      const html = await fetchTextWithTimeout(
        `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`,
        { 'User-Agent': MUSIC_UA, 'Accept-Language': 'en-US,en;q=0.9' },
        3500
      );
      const blocked =
        html.includes('"status":"ERROR"') ||
        html.includes('"status":"UNPLAYABLE"') ||
        html.includes('"status":"LOGIN_REQUIRED"') ||
        html.includes('Playback on other websites has been disabled') ||
        html.includes('Video unavailable');
      const ok = !blocked;
      ytEmbeddableCache.set(videoId, { ok, at: Date.now() });
      return ok;
    } catch {
      return true;
    }
  }

  app.get('/api/music/resolve-stream', async (req, res) => {
    const title = typeof req.query.title === 'string' ? req.query.title.trim() : '';
    const rawArtist = typeof req.query.artist === 'string' ? req.query.artist.trim() : '';
    const artist = cleanArtistForSearch(rawArtist);
    const expectedDurationSec = Math.max(0, Math.round(Number(req.query.duration) || 0));
    const excludeRaw = typeof req.query.excludeIds === 'string' ? req.query.excludeIds : '';
    const excludeSet = new Set(
      excludeRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
    const skipYt = req.query.skipYoutube === '1';

    if (!title) {
      return res.status(400).json({ error: 'Missing track title.' });
    }

    const baseTitle = stripMusicNoiseTags(title) || title;
    const primaryArtist = extractPrimaryArtists(artist)[0] || artist;
    const qPrimary = `${baseTitle} ${primaryArtist}`.trim();

    try {
      const [ytMusicMatches, ytWebAudioMatches, audiusMatches] = await Promise.all([
        skipYt ? Promise.resolve([]) : searchYouTubeMusic(qPrimary, 8),
        skipYt ? Promise.resolve([]) : searchYouTubeWeb(`${qPrimary} official audio`, 8),
        searchAudius(qPrimary, 8),
      ]);

      // 1. Primary resolution: Official YouTube Music Songs + YouTube Audio (prevents Audius DJ bootleg hijacks)
      if (!skipYt) {
        const ytScoreMap = new Map<string, { track: ServerMusicTrack; score: number }>();

        // Official YouTube Music Song matches get +16 official-album preference bonus
        for (const item of ytMusicMatches) {
          if (!item.playbackId || excludeSet.has(item.playbackId)) continue;
          const sc = scoreStreamCandidate(item, baseTitle, artist, expectedDurationSec);
          if (sc >= 45) {
            ytScoreMap.set(item.playbackId, { track: item, score: sc + 16 });
          }
        }

        for (const item of ytWebAudioMatches) {
          if (!item.playbackId || excludeSet.has(item.playbackId)) continue;
          const sc = scoreStreamCandidate(item, baseTitle, artist, expectedDurationSec);
          if (sc >= 45) {
            const existing = ytScoreMap.get(item.playbackId);
            if (!existing || sc > existing.score) {
              ytScoreMap.set(item.playbackId, { track: item, score: sc });
            }
          }
        }

        const rankedYt = Array.from(ytScoreMap.values()).sort((a, b) => b.score - a.score);
        const topCandidates = rankedYt.slice(0, 4);
        const embedChecks = await Promise.all(
          topCandidates.map((c) => isYouTubeEmbeddable(c.track.playbackId!))
        );
        const bestEmbeddableIdx = embedChecks.findIndex((ok) => ok);
        if (bestEmbeddableIdx >= 0) {
          const chosen = topCandidates[bestEmbeddableIdx].track;
          return res.json({
            playbackType: 'youtube',
            playbackId: chosen.playbackId,
            durationSec: chosen.durationSec,
          });
        }
      }

      // 2. Backup: strictly verified Audius match (no edits/bootlegs, exact artist + title + duration)
      const rankedAudius = audiusMatches
        .filter((t) => Boolean(t.streamUrl))
        .map((t) => ({
          track: t,
          score: scoreStreamCandidate(t, baseTitle, artist, expectedDurationSec),
        }))
        .filter((r) => r.score >= 85)
        .sort((a, b) => b.score - a.score);

      if (rankedAudius.length > 0 && rankedAudius[0].track.streamUrl) {
        return res.json({
          playbackType: 'audio',
          streamUrl: rankedAudius[0].track.streamUrl,
          durationSec: rankedAudius[0].track.durationSec,
        });
      }

      return res.json({ playbackType: 'preview' });
    } catch {
      return res.json({ playbackType: 'preview' });
    }
  });

  app.get('/api/music/resolve', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!rawUrl) {
      return res.status(400).json({ error: 'Paste a song or playlist URL.' });
    }

    try {
      // Spotify URI support (spotify:track:...)
      const spUri = rawUrl.match(/^spotify:(track|album|playlist):([a-zA-Z0-9]+)$/);
      if (spUri) {
        const resCol = await fetchSpotifyEmbedCollection(spUri[1] as 'track' | 'album' | 'playlist', spUri[2]);
        if (!resCol.tracks.length) return res.status(404).json({ error: 'No playable tracks found on that Spotify link.' });
        return res.json({ playlistTitle: resCol.name, tracks: resCol.tracks });
      }

      const parsed = new URL(rawUrl);
      const host = parsed.hostname.toLowerCase();

      // 1. Spotify URL
      if (host.includes('spotify.com')) {
        const m = parsed.pathname.match(/\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
        if (!m) return res.status(400).json({ error: 'Use a Spotify track, album, or playlist link.' });
        const resCol = await fetchSpotifyEmbedCollection(m[1] as 'track' | 'album' | 'playlist', m[2]);
        if (!resCol.tracks.length) return res.status(404).json({ error: 'Could not read tracks from that Spotify link.' });
        return res.json({ playlistTitle: resCol.name, tracks: resCol.tracks });
      }

      // 2. YouTube Music / YouTube URL
      if (host.includes('youtube.com') || host.includes('youtu.be')) {
        let videoId = '';
        if (host.includes('youtu.be')) {
          videoId = parsed.pathname.replace(/^\/+/, '').split('/')[0];
        } else {
          videoId = parsed.searchParams.get('v') || '';
          if (!videoId && parsed.pathname.startsWith('/shorts/')) {
            videoId = parsed.pathname.split('/')[2] || '';
          }
        }
        if (!/^[a-zA-Z0-9_-]{6,15}$/.test(videoId)) {
          return res.status(400).json({ error: 'Invalid YouTube or YouTube Music video link.' });
        }
        const isYtMusic = host.includes('music.youtube.com');
        let title = 'YouTube Track';
        let artist = isYtMusic ? 'YouTube Music' : 'YouTube';
        let artwork = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        try {
          const o = await fetchJsonWithTimeout(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
            { 'User-Agent': MUSIC_UA }
          );
          if (o?.title) title = String(o.title);
          if (o?.author_name) artist = String(o.author_name).replace(/\s*-\s*Topic$/i, '');
          if (o?.thumbnail_url) artwork = String(o.thumbnail_url);
        } catch {}

        const track: ServerMusicTrack = {
          id: `${isYtMusic ? 'ytmusic' : 'youtube'}:${videoId}`,
          title,
          artist,
          artwork,
          durationSec: 0,
          source: isYtMusic ? 'ytmusic' : 'youtube',
          sourceName: isYtMusic ? 'YouTube Music' : 'YouTube',
          sourceUrl: isYtMusic
            ? `https://music.youtube.com/watch?v=${videoId}`
            : `https://www.youtube.com/watch?v=${videoId}`,
          playbackType: 'youtube',
          playbackId: videoId,
        };
        return res.json({ tracks: [track] });
      }

      // 3. SoundCloud URL
      if (host.includes('soundcloud.com')) {
        const cleanUrl = `${parsed.origin}${parsed.pathname}`;
        const o = await fetchJsonWithTimeout(
          `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(cleanUrl)}`,
          { 'User-Agent': MUSIC_UA }
        );
        const track: ServerMusicTrack = {
          id: `soundcloud:${encodeURIComponent(cleanUrl)}`,
          title: String(o?.title || 'SoundCloud Track').replace(/\s+by\s+.+$/i, ''),
          artist: String(o?.author_name || 'SoundCloud Artist'),
          artwork: o?.thumbnail_url ? String(o.thumbnail_url) : undefined,
          durationSec: 0,
          source: 'soundcloud',
          sourceName: 'SoundCloud',
          sourceUrl: cleanUrl,
          playbackType: 'soundcloud',
          playbackId: cleanUrl,
        };
        return res.json({ tracks: [track] });
      }

      // 4. Deezer Track URL
      if (host.includes('deezer.com')) {
        const m = parsed.pathname.match(/\/track\/(\d+)/);
        if (!m) return res.status(400).json({ error: 'Use a Deezer track link (deezer.com/track/...).' });
        const t = await fetchJsonWithTimeout(`https://api.deezer.com/track/${m[1]}`);
        return res.json({
          tracks: [
            {
              id: `deezer:${t.id}`,
              title: String(t.title || 'Deezer Track'),
              artist: String(t.artist?.name || 'Deezer Artist'),
              album: t.album?.title,
              artwork: t.album?.cover_big || t.album?.cover_medium,
              durationSec: Number(t.duration) || 0,
              source: 'deezer',
              sourceName: 'Deezer',
              sourceUrl: String(t.link || rawUrl),
              playbackType: 'resolve',
              previewUrl: t.preview,
            } as ServerMusicTrack,
          ],
        });
      }

      // 5. Apple Music URL
      if (host.includes('music.apple.com')) {
        const idParam = parsed.searchParams.get('i') || parsed.pathname.split('/').pop() || '';
        if (!/^\d+$/.test(idParam)) {
          return res.status(400).json({ error: 'Use an Apple Music song link.' });
        }
        const data = await fetchJsonWithTimeout(`https://itunes.apple.com/lookup?id=${idParam}&entity=song`);
        const t = Array.isArray(data?.results) ? data.results.find((r: any) => r.trackName) : null;
        if (!t) return res.status(404).json({ error: 'Song not found on Apple Music.' });
        return res.json({
          tracks: [
            {
              id: `apple:${t.trackId}`,
              title: String(t.trackName),
              artist: String(t.artistName || 'Apple Music Artist'),
              album: t.collectionName,
              artwork: t.artworkUrl100 ? String(t.artworkUrl100).replace('100x100bb', '400x400bb') : undefined,
              durationSec: Math.round((Number(t.trackTimeMillis) || 0) / 1000),
              source: 'apple',
              sourceName: 'Apple Music',
              sourceUrl: String(t.trackViewUrl || rawUrl),
              playbackType: 'resolve',
              previewUrl: t.previewUrl,
            } as ServerMusicTrack,
          ],
        });
      }

      // 6. Audius URL
      if (host.includes('audius.co')) {
        const resolved = await fetchJsonWithTimeout(
          `https://discoveryprovider.audius.co/v1/resolve?url=${encodeURIComponent(rawUrl)}&app_name=AtlasMusic`
        );
        const t = resolved?.data;
        if (!t || !t.id) return res.status(404).json({ error: 'Track not found on Audius.' });
        return res.json({
          tracks: [
            {
              id: `audius:${t.id}`,
              title: String(t.title || 'Audius Track'),
              artist: String(t.user?.name || t.user?.handle || 'Audius Artist'),
              artwork: t.artwork?.['480x480'] || t.artwork?.['150x150'],
              durationSec: Number(t.duration) || 0,
              source: 'audius',
              sourceName: 'Audius',
              sourceUrl: rawUrl,
              playbackType: 'audio',
              streamUrl: `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(t.id)}/stream?app_name=AtlasMusic`,
            } as ServerMusicTrack,
          ],
        });
      }

      // 7. Direct Audio File (.mp3 / .ogg / .wav / .m4a / .flac)
      if (/\.(mp3|ogg|wav|m4a|flac|aac|webm)(\?|$)/i.test(rawUrl)) {
        const fname = decodeURIComponent(parsed.pathname.split('/').pop() || 'Audio Track').replace(/\.[^.]+$/, '');
        return res.json({
          tracks: [
            {
              id: `direct:${encodeURIComponent(rawUrl)}`,
              title: fname || 'Direct Audio',
              artist: parsed.hostname,
              durationSec: 0,
              source: 'direct',
              sourceName: parsed.hostname,
              sourceUrl: rawUrl,
              playbackType: 'audio',
              streamUrl: rawUrl,
            } as ServerMusicTrack,
          ],
        });
      }

      return res.status(400).json({
        error: 'Supported links: YouTube Music, YouTube, Spotify, SoundCloud, Audius, Apple Music, Deezer, or direct audio URLs.',
      });
    } catch (err: any) {
      return res.status(422).json({ error: err?.message || 'Could not resolve that music link.' });
    }
  });

  // Ensure /api/* routes never fall through to Vite/SPA index.html
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
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
