import type { MenuItemDto } from '@repo/shared';
import { m } from '../paraglide/messages.js';

const CATEGORY_ORDER = ['snack', 'main', 'drink', 'dessert'] as const;

const CATEGORY_LABELS: Record<string, () => string> = {
  snack: m.category_snack,
  main: m.category_main,
  drink: m.category_drink,
  dessert: m.category_dessert
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category]?.() ?? category;
}

export interface MenuCategory {
  category: string;
  items: MenuItemDto[];
}

/** Group menu items by category in one pass, in the fixed display order. */
export function groupMenu(items: MenuItemDto[]): MenuCategory[] {
  const byCategory = new Map<string, MenuItemDto[]>();
  for (const item of items) {
    const list = byCategory.get(item.category);
    if (list) list.push(item);
    else byCategory.set(item.category, [item]);
  }

  const ordered: MenuCategory[] = [];
  for (const category of CATEGORY_ORDER) {
    const list = byCategory.get(category);
    if (list) {
      ordered.push({ category, items: list });
      byCategory.delete(category);
    }
  }
  // Unknown categories (future seed data) still render, after the known ones
  for (const [category, list] of byCategory) ordered.push({ category, items: list });
  return ordered;
}
