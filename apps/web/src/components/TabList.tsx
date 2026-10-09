import { useRef, type KeyboardEvent } from 'react';

/** id of the tab button and of the panel it controls, for `aria-labelledby`. */
export const tabId = (idBase: string, id: string) => `${idBase}-tab-${id}`;
export const tabPanelId = (idBase: string) => `${idBase}-panel`;

const MOVES: Record<string, (index: number, count: number) => number> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1
};

/**
 * ARIA tabs with manual activation: one tab stop (the selected tab), arrow
 * keys / Home / End move focus along the row, Enter or Space selects. Manual
 * because selecting a pane can start its data loading — arrowing past a tab
 * should not. The caller renders the one panel with `role="tabpanel"`,
 * `id={tabPanelId(idBase)}` and `aria-labelledby={tabId(idBase, selected)}`.
 */
export function TabList<T extends string>({
  idBase,
  tabs,
  selected,
  onSelect,
  className
}: {
  idBase: string;
  tabs: readonly { id: T; label: string }[];
  selected: T;
  onSelect: (id: T) => void;
  className?: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = MOVES[event.key];
    const index = buttons.current.findIndex(button => button === document.activeElement);
    if (move === undefined || index === -1) return;
    event.preventDefault();
    buttons.current[move(index, tabs.length)]?.focus();
  };

  return (
    <div role="tablist" className={className} onKeyDown={handleKeyDown}>
      {tabs.map((entry, index) => (
        <button
          key={entry.id}
          ref={element => {
            buttons.current[index] = element;
          }}
          id={tabId(idBase, entry.id)}
          type="button"
          role="tab"
          aria-selected={selected === entry.id}
          // Only the selected tab's panel is rendered
          aria-controls={selected === entry.id ? tabPanelId(idBase) : undefined}
          tabIndex={selected === entry.id ? 0 : -1}
          onClick={() => onSelect(entry.id)}
          className={`h-10 rounded-[10px] px-4 font-semibold transition-colors ${
            selected === entry.id
              ? 'bg-golden text-btn-text'
              : 'bg-club-green-light text-creme hover:bg-surface-hover'
          }`}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}
