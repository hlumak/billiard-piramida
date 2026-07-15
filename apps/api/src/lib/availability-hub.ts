import type { IsoDate } from '@repo/shared';

/** Structural subset of ws.WebSocket — keeps the hub free of transport types. */
export interface AvailabilitySubscriber {
  send(data: string): void;
  readyState: number;
}

const WS_OPEN = 1;

/**
 * In-process pub/sub: sockets subscribe to calendar dates; booking mutations
 * notify the date so viewers refetch availability immediately.
 */
export class AvailabilityHub {
  private readonly byDate = new Map<IsoDate, Set<AvailabilitySubscriber>>();

  subscribe(date: IsoDate, socket: AvailabilitySubscriber): void {
    const set = this.byDate.get(date);
    if (set) set.add(socket);
    else this.byDate.set(date, new Set([socket]));
  }

  unsubscribe(date: IsoDate, socket: AvailabilitySubscriber): void {
    const set = this.byDate.get(date);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) this.byDate.delete(date);
  }

  /** Remove a socket from every date (connection closed). */
  drop(socket: AvailabilitySubscriber): void {
    for (const [date, set] of this.byDate) {
      set.delete(socket);
      if (set.size === 0) this.byDate.delete(date);
    }
  }

  notify(date: IsoDate): void {
    const set = this.byDate.get(date);
    if (!set) return;
    const payload = JSON.stringify({ type: 'availability_changed', date });
    for (const socket of set) {
      if (socket.readyState === WS_OPEN) socket.send(payload);
    }
  }
}
