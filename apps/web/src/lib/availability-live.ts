import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { IsoDate } from '@repo/shared';
import { availabilityQuery } from './queries';

const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';
const WS_URL = `${API_URL.replace(/^http/, 'ws')}/api/ws`;

const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

type Listener = (date: IsoDate) => void;

/**
 * One shared WebSocket for the whole app. Dates are refcounted: the socket
 * subscribes on first listener, unsubscribes on last, and closes when idle.
 * On (re)connect every watched date fires once — events may have been missed.
 */
class AvailabilityLive {
  private socket: WebSocket | null = null;
  private readonly listeners = new Map<IsoDate, Set<Listener>>();
  private retryMs = INITIAL_RETRY_MS;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe(date: IsoDate, listener: Listener): () => void {
    const set = this.listeners.get(date);
    if (set) {
      set.add(listener);
    } else {
      this.listeners.set(date, new Set([listener]));
      this.sendIfOpen({ type: 'subscribe', date });
    }
    this.ensureConnected();

    return () => {
      const current = this.listeners.get(date);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(date);
        this.sendIfOpen({ type: 'unsubscribe', date });
        if (this.listeners.size === 0) this.disconnect();
      }
    };
  }

  private ensureConnected(): void {
    if (typeof WebSocket === 'undefined') return; // SSR
    if (this.socket !== null) return;

    const socket = new WebSocket(WS_URL);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.retryMs = INITIAL_RETRY_MS;
      for (const date of this.listeners.keys()) {
        socket.send(JSON.stringify({ type: 'subscribe', date }));
        // Refetch once per watched date — changes may have happened while offline
        this.emit(date);
      }
    });

    socket.addEventListener('message', event => {
      try {
        const message = JSON.parse(String(event.data)) as { type?: string; date?: string };
        if (message.type === 'availability_changed' && typeof message.date === 'string') {
          this.emit(message.date as IsoDate);
        }
      } catch {
        /* ignore malformed frames */
      }
    });

    socket.addEventListener('close', () => {
      // Ignore the close of a socket we already replaced (a disconnect()
      // during a step/date transition creates a fresh socket synchronously,
      // and the old one's close event fires afterwards). Without this guard it
      // would null out the live socket, leak it, and schedule a spurious retry.
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.listeners.size === 0) return;
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.ensureConnected();
      }, this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
    });
    // 'error' is always followed by 'close' — reconnect logic lives there
  }

  private disconnect(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }

  private sendIfOpen(message: { type: string; date: IsoDate }): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private emit(date: IsoDate): void {
    const set = this.listeners.get(date);
    if (!set) return;
    for (const listener of set) listener(date);
  }
}

export const availabilityLive = new AvailabilityLive();

/** Refetch availability for `date` the moment anyone books/extends/cancels on it. */
export function useLiveAvailability(date: IsoDate): void {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      availabilityLive.subscribe(date, changed => {
        queryClient.invalidateQueries({ queryKey: availabilityQuery(changed).queryKey });
      }),
    [date, queryClient]
  );
}
