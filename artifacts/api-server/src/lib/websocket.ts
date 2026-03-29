import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

let wss: WebSocketServer | null = null;

export function initWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    console.log("[ws] Client connected");
    ws.send(JSON.stringify({ type: "connected", message: "EEJ WebSocket connected" }));

    ws.on("close", () => {
      console.log("[ws] Client disconnected");
    });

    ws.on("error", (err) => {
      console.error("[ws] Error:", err);
    });
  });

  console.log("[ws] WebSocket server initialized on /ws");
}

export function broadcast(event: string, data: unknown): void {
  if (!wss) return;
  const message = JSON.stringify({ type: event, data, timestamp: new Date().toISOString() });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Convenience functions for common events
export function broadcastWorkerUpdate(workerId: string, changes: Record<string, unknown>): void {
  broadcast("worker:updated", { workerId, changes });
}

export function broadcastComplianceAlert(alert: { workerId: string; workerName: string; document: string; daysLeft: number }): void {
  broadcast("compliance:alert", alert);
}

export function broadcastApplicationUpdate(applicationId: string, stage: string): void {
  broadcast("application:stage_changed", { applicationId, stage });
}

export function broadcastNewNotification(notification: { workerId: string; channel: string; message: string }): void {
  broadcast("notification:new", notification);
}
