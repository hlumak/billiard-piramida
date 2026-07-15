import { isIsoDate, type IsoDate } from '@repo/shared';
import type { AppInstance } from '../app.ts';

/** A single viewer rarely watches more than a couple of dates. */
const MAX_SUBSCRIPTIONS = 4;
const PING_INTERVAL_MS = 30_000;

interface ClientMessage {
  type?: unknown;
  date?: unknown;
}

export function liveRoutes(app: AppInstance) {
  app.get('/api/ws', { websocket: true }, (socket, request) => {
    const subscribed = new Set<IsoDate>();

    // Keep the connection alive through nginx and reap dead peers
    const ping = setInterval(() => socket.ping(), PING_INTERVAL_MS);

    socket.on('message', (raw: unknown) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        return;
      }
      const { type, date } = message;
      if (typeof date !== 'string' || !isIsoDate(date)) return;

      if (type === 'subscribe' && subscribed.size < MAX_SUBSCRIPTIONS) {
        subscribed.add(date);
        app.availabilityHub.subscribe(date, socket);
      } else if (type === 'unsubscribe') {
        subscribed.delete(date);
        app.availabilityHub.unsubscribe(date, socket);
      }
    });

    socket.on('close', () => {
      clearInterval(ping);
      app.availabilityHub.drop(socket);
    });

    socket.on('error', (error: Error) => {
      request.log.warn({ err: error }, 'websocket error');
      clearInterval(ping);
      app.availabilityHub.drop(socket);
    });
  });
}
