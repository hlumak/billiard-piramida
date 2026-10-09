import { isIsoDate, type IsoDate } from '@repo/shared';
import type { AppInstance } from '../app.ts';

/** A single viewer rarely watches more than a couple of dates. */
const MAX_SUBSCRIPTIONS = 4;
/** Open sockets per client address (a household or a club Wi-Fi is several tabs). */
const MAX_SOCKETS_PER_IP = 20;
/** Policy violation: the close code for "too many connections from you". */
const CLOSE_POLICY_VIOLATION = 1008;
const PING_INTERVAL_MS = 30_000;

interface ClientMessage {
  type?: unknown;
  date?: unknown;
}

/** Any JSON value parses — `null`, numbers, arrays — so only a plain object counts. */
function parseClientMessage(raw: string): ClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? (parsed as ClientMessage)
    : null;
}

export function liveRoutes(app: AppInstance) {
  // Each socket is held for up to an hour; without a cap one client could
  // open them until memory or file descriptors run out
  const socketsByIp = new Map<string, number>();

  app.get('/api/ws', { websocket: true }, (socket, request) => {
    const ip = request.ip;
    const open = socketsByIp.get(ip) ?? 0;
    if (open >= MAX_SOCKETS_PER_IP) {
      socket.close(CLOSE_POLICY_VIOLATION, 'too many connections');
      return;
    }
    socketsByIp.set(ip, open + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const left = (socketsByIp.get(ip) ?? 1) - 1;
      if (left <= 0) socketsByIp.delete(ip);
      else socketsByIp.set(ip, left);
    };

    const subscribed = new Set<IsoDate>();

    // Heartbeat: ping keeps the connection alive through nginx, and a missed pong
    // reaps a dead-but-TCP-alive peer (sleep/partition) so its subscription can't
    // leak. terminate() fires 'close', which clears the timer and drops the socket.
    let isAlive = true;
    socket.on('pong', () => {
      isAlive = true;
    });
    const ping = setInterval(() => {
      if (!isAlive) {
        socket.terminate();
        return;
      }
      isAlive = false;
      socket.ping();
    }, PING_INTERVAL_MS);

    socket.on('message', (raw: unknown) => {
      // ws emits 'message' outside any try/catch of ours: a throw here is an
      // uncaughtException that takes the whole process down, so nothing a
      // client sends may escape this handler.
      try {
        const message = parseClientMessage(String(raw));
        if (message === null) return;
        const { type, date } = message;
        if (typeof date !== 'string' || !isIsoDate(date)) return;

        if (type === 'subscribe' && subscribed.size < MAX_SUBSCRIPTIONS) {
          subscribed.add(date);
          app.availabilityHub.subscribe(date, socket);
        } else if (type === 'unsubscribe') {
          subscribed.delete(date);
          app.availabilityHub.unsubscribe(date, socket);
        }
      } catch (err) {
        request.log.warn({ err }, 'dropping websocket client after a bad message');
        socket.terminate();
      }
    });

    socket.on('close', () => {
      clearInterval(ping);
      app.availabilityHub.drop(socket);
      release();
    });

    socket.on('error', (error: Error) => {
      request.log.warn({ err: error }, 'websocket error');
      clearInterval(ping);
      app.availabilityHub.drop(socket);
    });
  });
}
