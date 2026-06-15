import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
loadLocalEnv(join(__dirname, ".env"));
const port = Number(process.env.PORT || 3000);

const FALLBACK_DOMAINS = [
  "vidsrc-embed.ru",
  "vidsrc-embed.su",
  "vidsrcme.su",
  "vsrc.su"
];
const REQUEST_TIMEOUT_MS = 20000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function loadLocalEnv(filePath) {
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

let cachedDomains = null;
let cachedAt = 0;

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}

async function fetchWithTimeout(url, options = {}, timeout = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseDomains(html) {
  const matches = [...html.matchAll(/https?:\/\/([a-z0-9.-]*vidsrc[a-z0-9.-]*|vsrc\.su|vsembed\.(?:ru|su))|(?:^|>|\s)([a-z0-9-]+\.(?:ru|su))/gi)];
  const domains = matches
    .map((match) => match[1] || match[2])
    .filter(Boolean)
    .map((domain) => domain.toLowerCase().replace(/^www\./, ""))
    .filter((domain) => !domain.includes("community"))
    .filter((domain) => !domain.includes("domains"))
    .filter((domain) => !domain.includes("dash."));

  return [...new Set(domains)].filter((domain) => domain.includes("vidsrc") || domain === "vsrc.su" || domain.startsWith("vsembed."));
}

async function getVidsrcDomains(force = false) {
  const freshFor = 1000 * 60 * 30;
  if (!force && cachedDomains && Date.now() - cachedAt < freshFor) {
    return cachedDomains;
  }

  try {
    const response = await fetchWithTimeout("https://vidsrc.domains/", {
      headers: { "user-agent": "StreamFlix/1.0 (+https://vidsrc.domains)" }
    });
    if (!response.ok) throw new Error(`Vidsrc domain page returned ${response.status}`);
    const html = await response.text();
    const parsed = parseDomains(html);
    const preferred = parsed.filter((domain) => FALLBACK_DOMAINS.includes(domain));
    const domains = preferred.length ? preferred : parsed;
    cachedDomains = domains.length ? domains : FALLBACK_DOMAINS;
    cachedAt = Date.now();
    return cachedDomains;
  } catch (error) {
    cachedDomains = cachedDomains || FALLBACK_DOMAINS;
    cachedAt = Date.now();
    return cachedDomains;
  }
}

async function handleDomains(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const domains = await getVidsrcDomains(url.searchParams.get("refresh") === "1");
  sendJson(res, 200, {
    source: "https://vidsrc.domains/",
    fetchedAt: new Date(cachedAt).toISOString(),
    domains
  });
}

async function handleOmdb(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const apiKey = url.searchParams.get("apikey") || process.env.OMDB_API_KEY;
  if (!apiKey) {
    sendJson(res, 200, {
      Response: "False",
      Error: "Set OMDB_API_KEY on the host or paste an OMDb key in Netplix settings.",
      requiresKey: true
    });
    return;
  }

  const params = new URLSearchParams();
  for (const key of ["s", "i", "t", "type", "y", "plot", "page", "season", "episode"]) {
    const value = url.searchParams.get(key);
    if (value) params.set(key, value);
  }
  params.set("apikey", apiKey);

  try {
    const response = await fetchWithTimeout(`https://www.omdbapi.com/?${params.toString()}`);
    const payload = await response.json();
    sendJson(res, response.ok ? 200 : response.status, payload);
  } catch (error) {
    sendJson(res, 502, { Response: "False", Error: "OMDb request failed.", detail: error.message });
  }
}

async function handleLatest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const kind = url.searchParams.get("kind") || "movies";
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const safeKind = kind === "tvshows" || kind === "episodes" ? kind : "movies";
  const [domain] = await getVidsrcDomains();
  const latestUrl = `https://${domain}/${safeKind}/latest/page-${page}.json`;

  try {
    const response = await fetchWithTimeout(latestUrl, {
      headers: { "user-agent": "StreamFlix/1.0 (+https://vidsrc.domains)" }
    });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
    sendJson(res, response.ok ? 200 : response.status, { source: latestUrl, payload });
  } catch (error) {
    sendJson(res, 502, { source: latestUrl, error: error.message });
  }
}

async function handlePoster(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const source = url.searchParams.get("url");
  if (!source || !/^https:\/\/m\.media-amazon\.com\//.test(source)) {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Invalid poster URL");
    return;
  }

  try {
    const response = await fetchWithTimeout(source, {
      headers: {
        "user-agent": "Mozilla/5.0 StreamFlix/1.0",
        "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      }
    });
    if (!response.ok) throw new Error(`Poster returned ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    res.writeHead(200, {
      "content-type": response.headers.get("content-type") || "image/jpeg",
      "cache-control": "public, max-age=86400"
    });
    res.end(bytes);
  } catch (error) {
    res.writeHead(302, { location: `/poster.svg?title=${encodeURIComponent("StreamFlix")}` });
    res.end();
  }
}

async function handleTmdb(req, res) {
  const incoming = new URL(req.url, `http://${req.headers.host}`);
  const path = incoming.pathname.replace(/^\/api\/tmdb\/?/, "");
  if (!path || path.includes("..")) {
    sendJson(res, 400, { error: "Invalid TMDB path" });
    return;
  }

  const tmdbUrl = new URL(`https://api.themoviedb.org/3/${path}`);
  incoming.searchParams.forEach((value, key) => tmdbUrl.searchParams.set(key, value));
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  const apiKey = process.env.TMDB_API_KEY;
  if (!token && apiKey) {
    tmdbUrl.searchParams.set("api_key", apiKey);
  } else if (!token && !apiKey) {
    sendJson(res, 200, { error: "Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY on the host." });
    return;
  }

  try {
    const response = await fetchWithTimeout(tmdbUrl, {
      headers: {
        "accept": "application/json",
        ...(token ? { "authorization": `Bearer ${token}` } : {})
      }
    });
    const payload = await response.json();
    sendJson(res, response.ok ? 200 : response.status, payload);
  } catch (error) {
    sendJson(res, 502, { error: "TMDB request failed.", detail: error.message });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = normalize(join(publicDir, requestedPath));

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(data);
  } catch {
    const data = await readFile(join(publicDir, "index.html"));
    res.writeHead(200, { "content-type": mimeTypes[".html"] });
    res.end(data);
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/vidsrc-domains")) return handleDomains(req, res);
    if (req.url.startsWith("/api/tmdb")) return handleTmdb(req, res);
    if (req.url.startsWith("/api/omdb")) return handleOmdb(req, res);
    if (req.url.startsWith("/api/poster")) return handlePoster(req, res);
    if (req.url.startsWith("/api/vidsrc-latest")) return handleLatest(req, res);
    if (req.url.startsWith("/api/health")) return sendJson(res, 200, { ok: true });
    return serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`StreamFlix is streaming at http://localhost:${port}`);
});
