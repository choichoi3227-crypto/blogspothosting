// custom-server.ts
// Custom Next.js server with WebSocket support
// Required for WebSocket on same port as HTTP

import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { getWSS } from "./src/lib/websocket";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);

      // Cloudflare-compatible headers
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

      // CORS for wp-json API paths
      if (req.url?.startsWith("/wp-json") || req.url?.startsWith("/api/")) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-WP-Nonce");
        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }
      }

      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Server error:", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  // Initialize WebSocket server (shares HTTP server for Cloudflare WS proxy compatibility)
  getWSS(server);
  console.log(`[WS] WebSocket server initialized on /api/websocket`);

  server.listen(port, hostname, () => {
    console.log(`[WPSpot] Server running at http://${hostname}:${port}`);
    console.log(`[WPSpot] WebSocket: ws://${hostname}:${port}/api/websocket`);
    console.log(`[WPSpot] Mode: ${dev ? "development" : "production"}`);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    server.close(() => {
      console.log("[WPSpot] Server closed");
      process.exit(0);
    });
  });
});
