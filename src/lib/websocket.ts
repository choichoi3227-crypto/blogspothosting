import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { parse } from "url";

// Singleton WSS
declare global {
  var __wss: WebSocketServer | undefined;
  var __clients: Map<string, Set<WebSocket>> | undefined;
}

function getWSS(server: any): WebSocketServer {
  if (!global.__wss) {
    global.__wss = new WebSocketServer({ noServer: true });
    global.__clients = new Map();

    global.__wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      const ip = req.socket.remoteAddress || "unknown";
      let channel = "general";

      // Send ping every 30s to keep Cloudflare alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.ping();
      }, 30000);

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "subscribe" && msg.channel) {
            channel = msg.channel;
            if (!global.__clients!.has(channel)) {
              global.__clients!.set(channel, new Set());
            }
            global.__clients!.get(channel)!.add(ws);

            // Send initial stats
            if (channel === "stats") {
              ws.send(JSON.stringify({ type: "stats", siteCount: getSiteCount() }));
            }
          }
          if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
          }
        } catch {}
      });

      ws.on("close", () => {
        clearInterval(pingInterval);
        global.__clients?.get(channel)?.delete(ws);
      });

      ws.on("error", () => {
        clearInterval(pingInterval);
      });
    });

    server.on("upgrade", (req: IncomingMessage, socket: any, head: Buffer) => {
      const { pathname } = parse(req.url || "");
      if (pathname === "/api/websocket") {
        global.__wss!.handleUpgrade(req, socket, head, (ws) => {
          global.__wss!.emit("connection", ws, req);
        });
      } else {
        socket.destroy();
      }
    });
  }
  return global.__wss;
}

// Broadcast to a channel
export function broadcast(channel: string, data: object) {
  const clients = global.__clients?.get(channel);
  if (!clients) return;
  const msg = JSON.stringify(data);
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

// Broadcast deployment status
export function broadcastDeployStatus(siteId: string, status: string, message: string) {
  broadcast(`deploy:${siteId}`, { type: "deploy_status", siteId, status, message, ts: Date.now() });
}

function getSiteCount(): number {
  // Returns live site count from DB
  try {
    const db = require("@/lib/db").getDb();
    const row = db.prepare("SELECT COUNT(*) as c FROM sites WHERE status='active'").get() as { c: number };
    return row?.c || 0;
  } catch {
    return 0;
  }
}

export { getWSS };
