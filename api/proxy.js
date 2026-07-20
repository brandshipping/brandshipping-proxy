const TARGET_ORIGIN = "https://partners.brandshipping.com";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function getOriginalPath(req) {
  const rawPath = Array.isArray(req.query.path) ? req.query.path.join("/") : req.query.path || "";
  const search = new URL(req.url, "https://proxy.local").searchParams;
  search.delete("path");
  const query = search.toString();
  return `/${rawPath}${query ? `?${query}` : ""}`;
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(chunks.length ? Buffer.concat(chunks) : undefined));
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  const originalHost = (req.headers.host || "").split(",")[0].trim();
  const originalPath = getOriginalPath(req);
  const targetUrl = `${TARGET_ORIGIN}${originalPath}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || value == null) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  if (originalHost) headers.set("x-forwarded-host", originalHost);
  headers.set("x-forwarded-proto", "https");

  const method = req.method || "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : await collectBody(req);
  const upstream = await fetch(targetUrl, {
    method,
    headers,
    body,
    redirect: "manual",
  });

  res.statusCode = upstream.status;
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  });

  const arrayBuffer = await upstream.arrayBuffer();
  res.end(Buffer.from(arrayBuffer));
};
