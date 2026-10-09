import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { availabilityLive } from '../src/lib/availability-live';

/** Just enough WebSocket: the test drives open/message/close by hand. */
class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  closed = false;
  private handlers = new Map<string, ((event: { data?: unknown }) => void)[]>();

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  addEventListener(type: string, handler: (event: { data?: unknown }) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
  }
  fire(type: string, event: { data?: unknown } = {}) {
    if (type === 'open') this.readyState = FakeSocket.OPEN;
    for (const handler of this.handlers.get(type) ?? []) handler(event);
  }
}

const latest = () => {
  const socket = FakeSocket.instances.at(-1);
  if (!socket) throw new Error('no socket opened');
  return socket;
};

beforeEach(() => {
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('subscribes on open, refetches once for missed events, then on each change', () => {
  const heard: string[] = [];
  const stop = availabilityLive.subscribe('2026-10-12', date => heard.push(date));
  const socket = latest();
  expect(socket.url).toMatch(/^ws:\/\/.*\/api\/ws$/);

  socket.fire('open');
  expect(socket.sent).toEqual([{ type: 'subscribe', date: '2026-10-12' }]);
  expect(heard).toEqual(['2026-10-12']); // the catch-up refetch

  socket.fire('message', {
    data: JSON.stringify({ type: 'availability_changed', date: '2026-10-12' })
  });
  socket.fire('message', { data: 'not json' }); // ignored, not thrown
  socket.fire('message', {
    data: JSON.stringify({ type: 'availability_changed', date: '2026-10-13' })
  });
  expect(heard).toEqual(['2026-10-12', '2026-10-12']);

  stop();
  expect(socket.sent.at(-1)).toEqual({ type: 'unsubscribe', date: '2026-10-12' });
  expect(socket.closed).toBe(true); // nothing left to watch
});

test('one socket for many listeners; it stays open until the last one leaves', () => {
  const stopA = availabilityLive.subscribe('2026-10-12', () => {});
  const stopB = availabilityLive.subscribe('2026-10-12', () => {});
  expect(FakeSocket.instances).toHaveLength(1);
  latest().fire('open');
  stopA();
  expect(latest().closed).toBe(false);
  stopB();
  expect(latest().closed).toBe(true);
});

test('a dropped connection retries with growing delays while someone is watching', () => {
  const stop = availabilityLive.subscribe('2026-10-12', () => {});
  latest().fire('close');
  vi.advanceTimersByTime(999);
  expect(FakeSocket.instances).toHaveLength(1);
  vi.advanceTimersByTime(1);
  expect(FakeSocket.instances).toHaveLength(2);

  latest().fire('close');
  vi.advanceTimersByTime(1_999);
  expect(FakeSocket.instances).toHaveLength(2); // backed off to 2 s
  vi.advanceTimersByTime(1);
  expect(FakeSocket.instances).toHaveLength(3);
  stop();
});

test("a replaced socket's late close does not tear down the live one", () => {
  const stop = availabilityLive.subscribe('2026-10-12', () => {});
  const first = latest();
  stop(); // idle: closes the first socket (its close event comes later)
  const stopAgain = availabilityLive.subscribe('2026-10-13', () => {});
  const second = latest();
  expect(second).not.toBe(first);

  first.fire('close');
  vi.advanceTimersByTime(60_000);
  // No spurious reconnect, and the second socket is still the one in use
  expect(FakeSocket.instances).toHaveLength(2);
  second.fire('open');
  expect(second.sent).toEqual([{ type: 'subscribe', date: '2026-10-13' }]);
  stopAgain();
});
