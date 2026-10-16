import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button, Popover } from '@heroui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import type { AdminOnlineBookingDto } from '@repo/shared';
import { adminOnlineBookingsQuery } from '../../lib/admin-api';
import {
  bookingMinutes,
  formatClockRange,
  formatDay,
  warsawDate,
  warsawTime,
  warsawToday
} from '../../lib/format';
import { spotDescription } from '../../lib/spots';
import { useNowMinute } from '../../lib/use-now';
import { m } from '../../paraglide/messages.js';
import { PHASE_LABELS, PHASE_STYLES } from '../booking/phase';

/**
 * The staff panel's bell: bookings guests made on the site, so the desk hears
 * of them without watching the list. An open panel checks every half minute;
 * a new booking chimes, counts in the tab's title and, where the browser
 * allows it, raises a desktop notification even from a background tab.
 *
 * What counts as seen is kept per browser. Both marks are server timestamps
 * (a booking's createdAt), never this computer's clock, so a desk PC whose
 * clock runs fast cannot hide a booking made a minute ago.
 */

/** Newest createdAt the staff have looked at in the list */
const SEEN_KEY = 'piramida.admin.seen-at';
/** Newest createdAt already chimed for — shared by tabs, so two tabs chime once */
const ALERTED_KEY = 'piramida.admin.alerted-at';
const SOUND_OFF_KEY = 'piramida.admin.sound-off';

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode or blocked storage: the bell still works for this page */
  }
}

/**
 * The seen mark as an external store: written by this tab (first answer,
 * opening the list) or by another tab (the storage event), read on render.
 */
const seenListeners = new Set<() => void>();

function subscribeSeen(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SEEN_KEY) listener();
  };
  seenListeners.add(listener);
  window.addEventListener('storage', onStorage);
  return () => {
    seenListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function markSeen(createdAt: string): void {
  store(SEEN_KEY, createdAt);
  for (const listener of seenListeners) listener();
}

let audio: AudioContext | null = null;

/** Browsers start audio muted until the page is used; any tap or key unlocks it. */
function unlockAudio(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    /* no Web Audio: the bell stays silent */
  }
}

/** Two soft rising notes, made on the spot: no sound file to load. */
function chime(): void {
  if (audio?.state !== 'running') return;
  const start = audio.currentTime;
  for (const [index, frequency] of [880, 1318.5].entries()) {
    const at = start + index * 0.18;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.65);
  }
}

function bookingLine(booking: AdminOnlineBookingDto): string {
  const { start, end } = bookingMinutes(booking);
  return [
    formatDay(warsawDate(booking.startsAt)),
    formatClockRange(start, end - start),
    spotDescription(booking.kind, booking.tableLabel, {
      game: booking.game,
      lowercaseGame: true
    })
  ].join(' · ');
}

/**
 * A system notification. Some browsers (Chrome on Android) only allow them
 * from a service worker and throw here; the bell and the chime still work.
 */
function notifyDesktop(fresh: AdminOnlineBookingDto[], onClick: () => void): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const [newest] = fresh;
  if (newest === undefined) return;
  try {
    const notification = new Notification(
      fresh.length === 1
        ? m.admin_alerts_notify_one()
        : m.admin_alerts_notify_many({ count: fresh.length }),
      {
        body: `${newest.customerName}\n${bookingLine(newest)}`,
        // One at a time: a newer one replaces the older instead of stacking
        tag: 'piramida-online-booking',
        icon: '/favicon-48.png'
      }
    );
    notification.onclick = () => {
      window.focus();
      onClick();
      notification.close();
    };
  } catch {
    /* see above */
  }
}

type Permission = NotificationPermission | 'unsupported';

function readPermission(): Permission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/** The title without the "(2) " count this component puts in front. */
const titleWithoutCount = (title: string) => title.replace(/^\(\d+\) /, '');

export function BookingAlerts({ onShowBooking }: { onShowBooking: (phone: string) => void }) {
  const queryClient = useQueryClient();
  const { data } = useQuery(adminOnlineBookingsQuery());
  const [open, setOpen] = useState(false);
  // Null until the first answer sets the baseline (see the effect below)
  const seen = useSyncExternalStore(
    subscribeSeen,
    () => readStored(SEEN_KEY),
    () => null
  );
  // What was new when the list opened: those keep their mark while it is open
  const [shownSince, setShownSince] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(() => readStored(SOUND_OFF_KEY) !== '1');
  const [permission, setPermission] = useState<Permission>(readPermission);
  const today = warsawToday(useNowMinute());

  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  useEffect(() => {
    if (data === undefined) return;
    const newest = data[0]?.createdAt ?? '';
    // First visit in this browser: what is already there counts as seen. An
    // empty list leaves '' so the very next booking is new.
    let baseline = readStored(SEEN_KEY);
    if (baseline === null) {
      baseline = newest;
      markSeen(baseline);
    }
    const alerted = readStored(ALERTED_KEY) ?? baseline;
    const fresh = data.filter(booking => booking.createdAt > alerted);
    if (fresh.length === 0) return;
    store(ALERTED_KEY, newest);
    if (readStored(SOUND_OFF_KEY) !== '1') chime();
    notifyDesktop(fresh, () => setOpen(true));
    // The day's lists and the schedule should show it now, not at their next poll
    void queryClient.invalidateQueries({
      predicate: query => query.queryKey[0] === 'admin' && query.queryKey[1] !== 'online-bookings'
    });
  }, [data, queryClient]);

  const unseen = seen === null ? [] : (data ?? []).filter(b => b.createdAt > seen);

  useEffect(() => {
    const base = titleWithoutCount(document.title);
    document.title = unseen.length > 0 ? `(${unseen.length}) ${base}` : base;
    return () => {
      document.title = titleWithoutCount(document.title);
    };
  }, [unseen.length]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setShownSince(seen);
      // Seen once looked at: up to the newest the list holds
      const newest = data?.[0]?.createdAt;
      if (newest !== undefined && (seen === null || newest > seen)) markSeen(newest);
    }
  };

  const enableDesktop = async () => {
    unlockAudio();
    if (typeof Notification === 'undefined') return;
    setPermission(await Notification.requestPermission());
  };

  const label =
    unseen.length > 0 ? m.admin_alerts_label_new({ count: unseen.length }) : m.admin_alerts_label();

  return (
    <Popover isOpen={open} onOpenChange={onOpenChange}>
      <Button
        isIconOnly
        variant="ghost"
        aria-label={label}
        className="relative size-11 flex-none rounded-xl bg-club-green-light text-creme hover:bg-creme/10"
      >
        <Bell aria-hidden className="size-5" strokeWidth={2.1} />
        {unseen.length > 0 ? (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-golden px-1 text-[11px] font-bold text-btn-text"
          >
            {unseen.length > 9 ? '9+' : unseen.length}
          </span>
        ) : null}
      </Button>
      <Popover.Content
        placement="bottom end"
        className="w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-line bg-club-green-dark p-0 text-creme"
      >
        <Popover.Dialog className="outline-none">
          <Popover.Heading className="border-b border-line px-4 py-3 text-sm font-bold">
            {m.admin_alerts_heading()}
          </Popover.Heading>
          {data === undefined || data.length === 0 ? (
            <p className="px-4 py-6 text-sm text-grey-cool">{m.admin_alerts_empty()}</p>
          ) : (
            <ul className="max-h-[50dvh] overflow-y-auto py-1">
              {data.map(booking => {
                const isNew = shownSince === null || booking.createdAt > shownSince;
                const booked = warsawDate(booking.createdAt);
                const bookedAt =
                  booked === today
                    ? warsawTime(booking.createdAt)
                    : `${formatDay(booked)} ${warsawTime(booking.createdAt)}`;
                return (
                  <li key={booking.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onShowBooking(booking.customerPhone);
                      }}
                      className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left hover:bg-creme/6 focus-visible:bg-creme/6 focus-visible:outline-none"
                    >
                      <span className="flex items-center gap-2 text-[15px] font-semibold">
                        {booking.customerName}
                        {isNew ? (
                          <span className="rounded-full bg-golden px-2 py-0.5 text-[11px] font-bold text-btn-text">
                            {m.admin_alerts_new()}
                          </span>
                        ) : null}
                        {booking.status !== 'confirmed' ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PHASE_STYLES[booking.status]}`}
                          >
                            {PHASE_LABELS[booking.status]()}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-sm text-cream-soft first-letter:uppercase">
                        {bookingLine(booking)}
                      </span>
                      <span className="text-xs text-grey-cool">
                        {m.admin_alerts_booked_at({ time: bookedAt })}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-col gap-2 border-t border-line px-4 py-3 text-sm">
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={soundOn}
                onChange={event => {
                  setSoundOn(event.target.checked);
                  store(SOUND_OFF_KEY, event.target.checked ? '0' : '1');
                  if (event.target.checked) unlockAudio();
                }}
                className="size-4 accent-golden"
              />
              {m.admin_alerts_sound()}
            </label>
            {permission === 'default' ? (
              <button
                type="button"
                onClick={() => void enableDesktop()}
                className="self-start font-semibold text-golden-light hover:text-golden"
              >
                {m.admin_alerts_desktop_enable()}
              </button>
            ) : permission === 'granted' ? (
              <p className="text-grey-cool">{m.admin_alerts_desktop_on()}</p>
            ) : permission === 'denied' ? (
              <p className="text-grey-cool">{m.admin_alerts_desktop_blocked()}</p>
            ) : null}
            <p className="text-xs text-grey-cool">{m.admin_alerts_hint()}</p>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
