import type { ReactNode } from 'react';
import { Switch } from '@heroui/react';

/**
 * The panel's on/off control: HeroUI's switch with its label beside it.
 * It replaced native checkboxes, whose unticked box was the browser's own
 * white square on the dark green.
 *
 * Switch.Content is the clickable <label> (React Aria's SwitchButton, with
 * the hidden input inside), so the track must sit inside it: placed beside
 * it, the track looked like a switch but a click on it reached nothing.
 */
export function AdminSwitch({
  isSelected,
  onChange,
  isDisabled = false,
  className = '',
  children
}: {
  isSelected: boolean;
  onChange: (isSelected: boolean) => void;
  isDisabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Switch
      size="sm"
      isSelected={isSelected}
      isDisabled={isDisabled}
      onChange={onChange}
      // The off track in the theme's default green vanished into the rows it sits on
      className={`[--switch-control-bg:rgb(246_241_220/0.3)] ${className}`}
    >
      <Switch.Content className="flex cursor-pointer flex-row items-center gap-2 text-sm font-semibold text-creme">
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        {children}
      </Switch.Content>
    </Switch>
  );
}
