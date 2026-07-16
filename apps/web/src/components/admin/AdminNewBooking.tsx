import { useState } from 'react';
import { Button, Input, Label, Modal, Spinner, TextField } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { slotStartsForDate, type IsoDate } from '@repo/shared';
import { isValidPhone } from '@repo/shared/phone';
import { adminApi } from '../../lib/admin-api';
import { ApiError } from '../../lib/api';
import { warsawToday, formatHour } from '../../lib/format';
import { availabilityQuery } from '../../lib/queries';
import { m } from '../../paraglide/messages.js';
import { AdminDatePicker } from './AdminDatePicker';

const chip = (selected: boolean, disabled = false) =>
  `h-9 min-w-[56px] rounded-[10px] px-2.5 text-sm font-semibold transition-colors ${
    selected
      ? 'bg-golden text-btn-text'
      : disabled
        ? 'bg-club-green text-grey-cool opacity-40'
        : 'bg-club-green text-creme hover:bg-surface-hover'
  }`;

/** Reception desk: create a booking for a walk-in / phone client. */
export function AdminNewBooking({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const [date, setDate] = useState<IsoDate>(() => warsawToday());
  const [startHour, setStartHour] = useState<number | null>(null);
  const [duration, setDuration] = useState(1);
  const [tableId, setTableId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const { data: availability } = useQuery({ ...availabilityQuery(date), enabled: isOpen });

  const create = useMutation({
    mutationFn: () =>
      adminApi.createBooking(token, {
        tableId: tableId!,
        date,
        startHour: startHour!,
        durationHours: duration,
        customerName: name.trim(),
        customerPhone: phone.trim()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: availabilityQuery(date).queryKey });
      setOpen(false);
      setStartHour(null);
      setTableId(null);
      setName('');
      setPhone('');
    }
  });

  // Staff may log games from earlier today, so offer every operating hour
  const hours = slotStartsForDate(date);
  const freeForWindow = (candidateTable: {
    tableId: number;
    slots: { hour: number; available: boolean }[];
  }) => {
    if (startHour === null) return false;
    const free = new Set<number>();
    for (const s of candidateTable.slots) if (s.available) free.add(s.hour);
    for (let h = startHour; h < startHour + duration; h++) if (!free.has(h)) return false;
    return true;
  };

  const canSubmit =
    startHour !== null && tableId !== null && name.trim().length > 0 && isValidPhone(phone);

  return (
    <Modal>
      <Button size="sm" className="font-semibold" onPress={() => setOpen(true)}>
        {m.admin_new_booking()}
      </Button>
      <Modal.Backdrop isOpen={isOpen} onOpenChange={setOpen}>
        <Modal.Container scroll="inside">
          <Modal.Dialog className="sm:max-w-lg">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{m.admin_new_booking()}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-4">
                <AdminDatePicker
                  value={date}
                  onChange={next => {
                    setDate(next ?? warsawToday());
                    setStartHour(null);
                    setTableId(null);
                  }}
                />

                <div>
                  <p className="mb-2 text-sm text-grey-cool">{m.admin_start_time()}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {hours.map(hour => (
                      <button
                        key={hour}
                        type="button"
                        aria-pressed={startHour === hour}
                        onClick={() => {
                          setStartHour(hour);
                          setTableId(null);
                        }}
                        className={chip(startHour === hour)}
                      >
                        {formatHour(hour)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm text-grey-cool">{m.time_duration()}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[1, 2, 3, 4].map(h => (
                      <button
                        key={h}
                        type="button"
                        aria-pressed={duration === h}
                        onClick={() => {
                          setDuration(h);
                          setTableId(null);
                        }}
                        className={chip(duration === h)}
                      >
                        {m.hours_n({ n: h })}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm text-grey-cool">{m.admin_pick_table()}</p>
                  {!availability ? (
                    <Spinner size="sm" aria-label={m.loading()} />
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {availability.tables.map(table => {
                        const free = freeForWindow(table);
                        return (
                          <button
                            key={table.tableId}
                            type="button"
                            disabled={!free}
                            aria-pressed={tableId === table.tableId}
                            onClick={() => setTableId(table.tableId)}
                            className={chip(tableId === table.tableId, !free)}
                          >
                            {m.table_n({ n: table.tableId })}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <TextField name="customerName" value={name} onChange={setName}>
                  <Label>{m.name_label()}</Label>
                  <Input placeholder={m.name_placeholder()} />
                </TextField>
                <TextField name="customerPhone" type="tel" value={phone} onChange={setPhone}>
                  <Label>{m.phone_label()}</Label>
                  <Input placeholder={m.phone_placeholder()} />
                </TextField>

                {create.error ? (
                  <p className="text-sm text-danger-soft-foreground">
                    {create.error instanceof ApiError && create.error.code === 'slot_taken'
                      ? m.err_slot_taken()
                      : m.err_generic()}
                  </p>
                ) : null}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button
                className="w-full font-bold"
                isDisabled={!canSubmit}
                isPending={create.isPending}
                onPress={() => create.mutate()}
              >
                {m.admin_create_btn()}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
