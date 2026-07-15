import { Button, Calendar, DateField, DatePicker } from '@heroui/react';
import { parseDate, type DateValue } from '@internationalized/date';
import { X } from 'lucide-react';
import { isIsoDate, type IsoDate } from '@repo/shared';
import { m } from '../../paraglide/messages.js';

/**
 * Club-themed date filter: HeroUI DatePicker (theme vars style the field and
 * calendar) with a clear button so "no filter" stays reachable.
 */
export function AdminDatePicker({
  value,
  onChange
}: {
  value: IsoDate | undefined;
  onChange: (date: IsoDate | undefined) => void;
}) {
  const parsed: DateValue | null = value ? parseDate(value) : null;

  return (
    <div className="flex items-center gap-1">
      <DatePicker
        aria-label={m.summary_date()}
        value={parsed}
        onChange={next => {
          const iso = next?.toString();
          onChange(iso !== undefined && isIsoDate(iso) ? iso : undefined);
        }}
        className="w-48"
      >
        <DateField.Group fullWidth>
          <DateField.Input>{segment => <DateField.Segment segment={segment} />}</DateField.Input>
          <DateField.Suffix>
            <DatePicker.Trigger>
              <DatePicker.TriggerIndicator />
            </DatePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>
        <DatePicker.Popover>
          <Calendar aria-label={m.summary_date()}>
            <Calendar.Header>
              <Calendar.YearPickerTrigger>
                <Calendar.YearPickerTriggerHeading />
                <Calendar.YearPickerTriggerIndicator />
              </Calendar.YearPickerTrigger>
              <Calendar.NavButton slot="previous" />
              <Calendar.NavButton slot="next" />
            </Calendar.Header>
            <Calendar.Grid>
              <Calendar.GridHeader>
                {day => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
              </Calendar.GridHeader>
              <Calendar.GridBody>{date => <Calendar.Cell date={date} />}</Calendar.GridBody>
            </Calendar.Grid>
            <Calendar.YearPickerGrid>
              <Calendar.YearPickerGridBody>
                {({ year }) => <Calendar.YearPickerCell year={year} />}
              </Calendar.YearPickerGridBody>
            </Calendar.YearPickerGrid>
          </Calendar>
        </DatePicker.Popover>
      </DatePicker>
      {value !== undefined ? (
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={m.admin_all_statuses()}
          onPress={() => onChange(undefined)}
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
