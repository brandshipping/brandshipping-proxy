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
  "content-encoding",
]);

const REQUEST_HEADERS_TO_DROP = new Set([
  ...HOP_BY_HOP_HEADERS,
  "accept-encoding",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
  "x-real-ip",
  "x-vercel-deployment-url",
  "x-vercel-forwarded-for",
  "x-vercel-id",
  "x-vercel-ip-as-number",
  "x-vercel-ip-city",
  "x-vercel-ip-continent",
  "x-vercel-ip-country",
  "x-vercel-ip-country-region",
  "x-vercel-ip-latitude",
  "x-vercel-ip-longitude",
  "x-vercel-ip-postal-code",
  "x-vercel-proxied-for",
]);

function getOriginalPath(req) {
  const rawPath = Array.isArray(req.query.path)
    ? req.query.path.join("/")
    : req.query.path || "";

  const search = new URL(req.url, "https://proxy.local").searchParams;
  search.delete("path");

  const query = search.toString();
  return `/${rawPath}${query ? `?${query}` : ""}`;
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () =>
      resolve(chunks.length ? Buffer.concat(chunks) : undefined),
    );
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
    if (REQUEST_HEADERS_TO_DROP.has(lower) || value == null) continue;

    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  headers.set("accept-encoding", "identity");

  if (originalHost) {
    headers.set("x-forwarded-host", originalHost);
  }

  headers.set("x-forwarded-proto", "https");

  const method = req.method || "GET";
  const body =
    method === "GET" || method === "HEAD" ? undefined : await collectBody(req);

  const upstream = await fetch(targetUrl, {
    method,
    headers,
    body,
    redirect: "manual",
  });

  const arrayBuffer = await upstream.arrayBuffer();
  const bodyBuffer = Buffer.from(arrayBuffer);

  res.statusCode = upstream.status;

  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  });

  res.setHeader("x-brandshipping-proxy", "1");
  res.setHeader("content-length", String(bodyBuffer.length));
  res.end(bodyBuffer);
};
