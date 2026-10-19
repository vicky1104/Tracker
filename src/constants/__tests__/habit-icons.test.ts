/**
 * @jest-environment node
 */
import edgeFunctionIconKeys from '../../../supabase/functions/_shared/icon-keys.json';
import { MIGRATIONS } from '@/db/schema';
import { PLANNER_TEMPLATES } from '@/domain/templates';
import { createTestDb } from '@/test-utils/node-db';

import { HABIT_ICON_KEYS, isIconKey, LEGACY_EMOJI_ICONS, LIST_ICON_KEYS, resolveIconKey } from '../habit-icons';
import { CATEGORY_ICONS } from '../palette';

describe('habit icons', () => {
  it('uses only catalog keys in templates, categories and list icons', () => {
    for (const t of PLANNER_TEMPLATES) for (const s of t.suggestions) expect(isIconKey(s.icon)).toBe(true);
    for (const k of Object.values(CATEGORY_ICONS)) expect(isIconKey(k)).toBe(true);
    for (const k of LIST_ICON_KEYS) expect(isIconKey(k)).toBe(true);
    for (const k of Object.values(LEGACY_EMOJI_ICONS)) expect(isIconKey(k)).toBe(true);
  });

  it('resolves keys, legacy emoji (with or without variation selector) and unknown values', () => {
    expect(resolveIconKey('water')).toBe('water');
    expect(resolveIconKey('💧')).toBe('water');
    expect(resolveIconKey('☀️')).toBe('sun');
    expect(resolveIconKey('☀')).toBe('sun');
    expect(resolveIconKey('🦄')).toBe('check');
    expect(resolveIconKey(null)).toBe('check');
  });

  it('keeps keys within the server-side length limit (16)', () => {
    expect(HABIT_ICON_KEYS.every((k) => k.length <= 16)).toBe(true);
  });

  it('matches the icon keys the AI Edge Function may return', () => {
    expect([...edgeFunctionIconKeys].sort()).toEqual([...HABIT_ICON_KEYS].sort());
  });

  it('migrates stored emoji to icon keys (schema v2)', async () => {
    const db = await createTestDb();
    const ts = '2024-01-01T00:00:00.000Z';
    await db.run(
      `INSERT INTO habit_lists (id, name, color, icon, sort_order, created_at, updated_at) VALUES ('l1', 'L', '#2F9E7E', '📋', 0, ?, ?)`,
      [ts, ts],
    );
    await db.run(
      `INSERT INTO habits (id, list_id, name, icon, color, start_date, created_at, updated_at)
       VALUES ('h1', 'l1', 'Water', '💧', '#2F9E7E', '2024-01-01', ?, ?), ('h2', 'l1', 'Custom', 'run', '#2F9E7E', '2024-01-01', ?, ?)`,
      [ts, ts, ts, ts],
    );
    await db.exec(MIGRATIONS[1]);
    const habits = await db.all<{ id: string; icon: string }>('SELECT id, icon FROM habits ORDER BY id');
    expect(habits).toEqual([
      { id: 'h1', icon: 'water' },
      { id: 'h2', icon: 'run' },
    ]);
    expect((await db.first<{ icon: string }>("SELECT icon FROM habit_lists WHERE id = 'l1'"))?.icon).toBe('list');
  });
});
