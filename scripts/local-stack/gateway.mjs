// Minimal Supabase-style API gateway for the local stack (no dependencies).
// /auth/v1/* -> Supabase Auth on :9999, /rest/v1/* -> PostgREST on :3001
import http from "node:http";

const routes = [
  { prefix: "/auth/v1", port: 9999 },
  { prefix: "/rest/v1", port: 3001 },
];

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, prefer, range, accept-profile, content-profile, x-request-id, x-supabase-api-version",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-expose-headers": "content-range, x-supabase-api-version",
};

http
  .createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return res.end();
    }
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("ok");
    }
    const route = routes.find((r) => req.url.startsWith(r.prefix));
    if (!route) {
      res.writeHead(404, cors);
      return res.end("not found");
    }
    const headers = { ...req.headers, host: `127.0.0.1:${route.port}` };
    // Like the hosted gateway: when no user JWT is supplied, use the apikey as bearer.
    if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;
    const upstream = http.request(
      { host: "127.0.0.1", port: route.port, method: req.method, path: req.url.slice(route.prefix.length) || "/", headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, { ...up.headers, ...cors });
        up.pipe(res);
      },
    );
    upstream.on("error", (e) => {
      res.writeHead(502, cors);
      res.end(String(e));
    });
    req.pipe(upstream);
  })
  .listen(54321, "127.0.0.1");
