import type { ReactNode } from 'react';
import { Switch } from '@heroui/react';

/**
 * The panel's on/off control: HeroUI's switch with its label beside it.
 * It replaced native checkboxes, whose unticked box was the browser's own
 * white square on the dark green.
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
      className={`flex flex-row items-center gap-2 [--switch-control-bg:rgb(246_241_220/0.3)] ${className}`}
    >
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
      <Switch.Content className="text-sm font-semibold text-creme">{children}</Switch.Content>
    </Switch>
  );
}
