# HabitFlow — Habit Tracker & Daily Planner

A local-first habit tracker built with **Expo SDK 58**, **React Native 0.88**, **TypeScript** and **Expo Router**.
Tracking, history editing, multiple lists, statistics, reminders and export all work **offline, without an account**.
Supabase (auth + sync), the AI planner and RevenueCat subscriptions are optional layers that switch on via environment variables.

---

## Contents

1. [Quick start](#quick-start)
2. [Scripts & checks](#scripts--checks)
3. [Architecture](#architecture)
4. [Data model](#data-model)
5. [Statistics rules](#statistics-rules)
6. [Reminders](#reminders)
7. [Offline-first sync](#offline-first-sync)
8. [Configuring Supabase](#configuring-supabase)
9. [Configuring the AI planner](#configuring-the-ai-planner)
10. [Configuring subscriptions (RevenueCat)](#configuring-subscriptions-revenuecat)
11. [Building for Android & iOS (EAS)](#building-for-android--ios-eas)
12. [Testing](#testing)
13. [Implemented vs deferred](#implemented-vs-deferred)
14. [Production-readiness checklist](#production-readiness-checklist)

---

## Quick start

```bash
npm install
cp .env.example .env.local      # optional — leave empty for fully local mode
npx expo start                  # press i (iOS simulator) or a (Android emulator)
```

The core app runs in **Expo Go**. `react-native-purchases` runs in RevenueCat's preview mode there; real purchases, reliable notification actions and production behaviour need a **development build** (`npx expo run:ios|android` or `npx eas-cli@latest build --profile development`).

> Web is not a target platform. `expo-sqlite` on web needs WASM/COOP-COEP setup that this project does not configure.

## Scripts & checks

| Command | What it does |
|---|---|
| `npm test` | Jest (jest-expo): domain unit tests + SQLite repository and sync integration tests |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | `expo lint` (eslint-config-expo, including React Compiler rules) |
| `npx expo-doctor` | Dependency/config diagnostics |
| `maestro test .maestro` | End-to-end flows (needs [Maestro](https://maestro.mobile.dev) and a running build) |
| `supabase test db` | Row-level-security tests (pgTAP) against a local Supabase |

## Architecture

```
src/
  app/                    Expo Router routes only (screens + layouts)
    (tabs)/               NativeTabs: Today · My Lists · Statistics · Calendar · Settings
      <tab>/_layout.tsx   one native Stack per tab
    habit/[id].tsx        habit details & editable history
    habit/edit.tsx        create/edit habit (modal)
    list/edit.tsx         create/edit list (modal)
    onboarding.tsx  planner.tsx  premium.tsx
  domain/                 pure TypeScript — no React, no I/O (fully unit-tested)
    dates.ts              local-date arithmetic (DST/leap-year safe)
    schedule.ts           activity spans, versioned schedule rules
    stats.ts              daily %, rates, streaks, quota periods
    reminders.ts          notification planner + diff
    templates.ts          offline habit planner
    validation.ts         Zod schemas (forms, backups, AI responses)
  db/                     SQLite schema, migrations, repositories, outbox, backup
  sync/engine.ts          push/pull/merge (adapter-based, tested with a fake remote)
  data/                   DB provider, TanStack Query hooks & actions, events
  services/               notifications, Supabase, auth, sync, purchases, AI client, backups
  components/             design-system primitives (ui/), habit/list widgets, charts
  theme/                  design tokens + theme provider (system/light/dark, accents, density)
  state/app-store.ts      Zustand: settings snapshot, selected day/list, entitlement, sync, toasts
supabase/
  migrations/             Postgres schema, triggers, RLS
  functions/              ai-plan · delete-account · revenuecat-webhook (Deno)
  tests/rls.test.sql      pgTAP RLS tests
.maestro/                 E2E flows
```

**Key decisions**

- **SQLite is the source of truth.** Every write goes to SQLite in a transaction that also enqueues a sync-outbox entry; the UI reads through TanStack Query (`networkMode: 'always'`, so local queries never pause offline). Completion taps are applied optimistically.
- **Domain logic is pure.** Screens never compute statistics ad hoc — they call `domain/stats.ts`, which is what the tests cover.
- **Writes are serialised** through a single queue in `db/db.ts` so concurrent transactions can't interleave on the shared connection.
- **No secrets in the app.** Only `EXPO_PUBLIC_*` values (Supabase URL/anon key, RevenueCat public SDK keys) are bundled. The AI key, service-role key and RevenueCat secret live only in Edge Function secrets.
- **Charts are plain Views** (no SVG dependency), each with a screen-reader summary.
- **Drag-and-drop** uses `PanResponder` plus Move up/Move down buttons and accessibility actions, so it works without a third-party list library and without precise gestures.

## Data model

Local (SQLite) and remote (Postgres) share the same shape:

| Table | Notes |
|---|---|
| `habit_lists` | name, color, icon, sort order, `archived_on`, `inactive_ranges` |
| `habits` | configuration only; `kind` = `check` / `numeric`, `target`, `unit`, `target_direction` (`atLeast`/`atMost`), start/end date, archive fields |
| `habit_schedules` | **versioned** rules: `effective_from` + `rule` JSON. A date is evaluated against the version in effect on that date |
| `habit_reminders` | `HH:MM`, optional weekday restriction, enabled flag — several per habit |
| `habit_completions` | **primary key `(habit_id, date)`** — one record per habit per local day; `status` (`done`/`partial`/`skipped`/`missed`), `value`, `note` |
| `settings` / `user_settings` | theme, accent, density, first day of week, default reminder times, IANA time zone … |
| `subscription_entitlements`, `ai_generation_requests`, `app_config`, `profiles` | server only |

Conventions: client-generated UUIDs; ISO-8601 UTC timestamps for `created_at/updated_at/deleted_at`; **local calendar dates (`YYYY-MM-DD`) for occurrences**; soft deletes (tombstones) so deletions sync.

Schedule rules: `daily`, `weekdays` (selected days), `monthDays` (29–31 fall on the last day of shorter months), `interval` (every N days), `timesPerWeek`, `timesPerMonth`.

## Statistics rules

Implemented in `src/domain/stats.ts`, shown in-app under *Statistics → How statistics are calculated*:

- **Only eligible days count.** Unscheduled days, days before the start/after the end date, and archived spans never lower a rate or break a streak.
- **Skipped** = neutral: excluded from rates, does not break or extend streaks. Future days can be skipped in advance (holidays).
- **Missed**, **partial** (numeric below target), or **no record on a past scheduled day** = failure.
- **Today is pending** until completed or explicitly marked missed — an unfinished day is never counted as a failure.
- **Quota habits** (`N× per week/month`) are judged per period: target = `min(N, eligible days − skipped days)`; streak unit is weeks/months. Once a period's target is met, the habit is no longer "due" on the remaining days.
- **Daily %** = done ÷ due. On the dashboard, today's pending items count as due so you see what's left; historical aggregates exclude today's pending items.
- **Deleted** habits are excluded everywhere. **Archived** habits keep their history up to the archive date; **restoring** records the archived span as an inactive range (not missed).
- **Schedule edits** apply from today by default (past days keep their original schedule). The form offers "All history" when the user wants to correct a mistake. Completion records are never deleted by editing.
- Any historical edit immediately recomputes every view (queries are invalidated after the write).

## Reminders

`src/domain/reminders.ts` plans **one-shot** notifications for the next 14 days, capped at 60 (iOS allows 64 pending per app). Each notification's identifier encodes reminder, date, time and content, so `services/notifications.ts → syncReminders()` is an **idempotent diff** (cancel obsolete, schedule missing). It runs on launch, on resume, after every data change, and from the troubleshooting screen.

This design gives:

- reminders that **follow every schedule type** (including monthly, interval and quota habits),
- **no reminder for a day already completed or skipped**, and none once a weekly/monthly quota is met,
- automatic cancellation when a habit is archived, deleted, rescheduled or a reminder is disabled,
- "Mark done" action from the notification (category `habit_reminder`).

Permission is requested **only when the user adds a reminder**, after an in-app explanation. If it's denied, reminders stay saved and the UI links to system settings. Android re-registers scheduled notifications after reboot (`RECEIVE_BOOT_COMPLETED`, added by expo-notifications); iOS persists them natively.

**Limitation:** if the app isn't opened for ~14 days, the planned window runs out. A background refresh (`expo-background-task`) is listed under deferred work.

**Test on real devices.** Simulators/emulators differ from production (iOS simulator notification delivery, Android OEM battery managers, Doze). Use *Settings → Reminder troubleshooting → Send test in 5s*.

## Offline-first sync

`src/sync/engine.ts` (tests: `src/sync/__tests__/engine.test.ts`):

- **Push** drains the outbox oldest-first, parents before children, reading the *current* row → upserts are idempotent; outbox entries are acknowledged only if not re-queued during the request (no lost edits).
- **Pull** fetches rows by a server-assigned `server_updated_at` cursor per table.
- **Conflicts:** per-record **last-writer-wins** on client `updated_at`, enforced on both sides (Postgres trigger ignores stale writes). Completions converge on `(habit_id, date)`. Deletes are tombstones.
- **Retries:** exponential backoff (5s → 5min); local data and the queue survive restarts and expired sessions.
- **Guest → account:** on first sign-in everything local is queued (`bindUser`), an untouched auto-created default list on a fresh device is dropped to avoid a duplicate "My Habits", and switching accounts re-uploads to the new account.
- Sync status is visible in *Settings → Account & sync*.

Known trade-off: LWW depends on device clocks; a device with a badly wrong clock can win or lose conflicts unexpectedly.

## Configuring Supabase

1. Create a project and install the [Supabase CLI](https://supabase.com/docs/guides/cli).
2. `supabase link --project-ref <ref>` then `supabase db push` (applies `supabase/migrations`).
3. Auth → Providers → Email: enable; set the Site URL / redirect URLs for password reset.
4. Deploy functions: `supabase functions deploy ai-plan delete-account revenuecat-webhook`
   (`revenuecat-webhook` should be deployed with `--no-verify-jwt` because RevenueCat authenticates with its own header).
5. Put `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` (and in EAS environment variables for builds).
6. Plan limits (`app_config.plan_limits`) can be edited in the table editor; the app picks them up without an update.

RLS: every user-owned table checks `user_id = auth.uid()`; children additionally check that the parent list/habit belongs to the caller. Entitlements, AI usage and config are read-only for clients.

## Configuring the AI planner

The app works without AI (curated offline templates). To enable AI:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# optional: supabase secrets set ANTHROPIC_MODEL=claude-opus-5-5
```

and set `EXPO_PUBLIC_AI_PLANNER_ENABLED=true`. The `ai-plan` function:

- requires a signed-in user, validates input (3–300 chars),
- enforces a **per-user daily allowance** from `app_config` (free 3 / premium 30 by default), counted server-side,
- calls Claude (`claude-opus-5-5` by default, low effort, JSON-schema structured output, server-side refusal fallback enabled via `fallbacks: "default"`),
- validates the output with Zod and maps it to the app's schedule format,
- records token usage in `ai_generation_requests`; failed calls don't count against the allowance.

Suggestions are always shown for review and editing; nothing (habits or reminders) is created without confirmation. Set `ANTHROPIC_MODEL` to a smaller model if you want to trade quality for cost.

## Configuring subscriptions (RevenueCat)

1. Create products in App Store Connect / Google Play, add them to a RevenueCat **offering**, and attach them to an entitlement (default id `premium`).
2. Set `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
3. Webhook: RevenueCat → Integrations → Webhooks → `https://<ref>.functions.supabase.co/revenuecat-webhook`, Authorization header = `REVENUECAT_WEBHOOK_AUTH`; set `REVENUECAT_SECRET_API_KEY` as a function secret. The function re-fetches subscriber state from RevenueCat, so duplicate or out-of-order events converge.
4. Build a development build to test purchases (sandbox accounts).

The paywall shows store-provided prices, periods and intro offers (nothing hard-coded), auto-renewal and cancellation terms, Restore purchases, and Terms/Privacy links. A purchase counts only once the returned `CustomerInfo` contains the active entitlement. The paywall never appears unprompted: premium features show an inline lock that the user can tap.

**Free:** unlimited habits & lists, tracking, historical editing, standard reminders, streaks, 7/30-day stats, heatmap, per-list/per-habit stats, light/dark, export & local backups.
**Premium:** long ranges & trends, weekday insights, cloud sync, more AI suggestions, multi-week templates, extra accent themes.

## Building for Android & iOS (EAS)

```bash
npx eas-cli@latest login
npx eas-cli@latest build:configure          # creates eas.json
npx eas-cli@latest build --profile development --platform ios     # or android
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform ios    # / android
```

Set the `EXPO_PUBLIC_*` variables as EAS environment variables. Before the first store build, replace `com.example.habitflow` in `app.json` with your bundle id / package name. `ios/` and `android/` are generated (Continuous Native Generation); configure native behaviour through `app.json` plugins only.

## Testing

Automated (currently **79 tests**, all passing):

| Suite | Covers |
|---|---|
| `domain/__tests__/dates.test.ts` | month/year boundaries, leap years, DST-safe arithmetic, time-zone local dates |
| `domain/__tests__/schedule.test.ts` | every rule type, month-end clamping, intervals, archive/inactive ranges, versioned schedules |
| `domain/__tests__/stats.test.ts` | streaks (skip/miss/pending/partial), quota periods, proration, daily %, historical edits, schedule changes, archive/restore |
| `domain/__tests__/reminders.test.ts` | schedule-following, weekday filters, completed-day suppression, archived/deleted, quota suppression, budget, idempotent diff, rescheduling |
| `db/__tests__/repository.test.ts` | real SQLite (`node:sqlite`): CRUD, duplicate/rename/archive/restore/delete, versioning, unique completions, future-date rules, lists, outbox atomicity, backup round-trip/idempotency, CSV |
| `domain/__tests__/validation.test.ts` | form, schedule, reminder and AI-response validation; every bundled template is valid; template matching and premium gating |
| `sync/__tests__/engine.test.ts` | offline writes → push, multi-device pull, idempotent retries, LWW conflicts, stale-device protection, tombstones, network failure + retry, account switch, default-list dedupe |

Not executed in this environment (written, need tooling): `.maestro` E2E flows, `supabase/tests/rls.test.sql` (pgTAP), Edge Functions on Deno (they were type-checked against the pinned npm SDKs).

Manual device checklist: small phone (iPhone SE / 5" Android) and tablet layouts; largest Dynamic Type / font scale; VoiceOver/TalkBack on Today, habit form and calendar; airplane mode during edits then reconnect; app kill + restart mid-edit; background/resume across midnight; time-zone change; notification permission denied → granted; reminder delivery on locked device; reboot with pending reminders.

## Implemented vs deferred

**Implemented**

- Onboarding (skippable, focus areas, week start, reminder-time defaults, optional starter habits, no forced permission or registration)
- Today dashboard: greeting, day strip with per-day progress, daily % and progress bar, done/remaining/skipped, time-of-day sections, list switcher, weekly bars, one-tap complete with undo, empty states
- Habits: create/edit/rename/duplicate/archive/restore/delete, icon/color/category/description, yes-no and measurable (at least / at most) habits, 6 schedule types, start/end dates, multiple reminders, drag-and-drop + accessible reordering, search & filters, skip/missed/notes, detail screen with streaks, rates and editable history
- Lists: create/edit/reorder/archive/restore/delete (move or delete habits), per-list and combined progress
- Calendar: month and week views, day panel, free historical editing, non-colour state glyphs, legend
- Statistics: rates, streaks, heatmap, trends, weekday breakdown, per-list & per-habit, range and list filters, previous-period delta
- Reminders: planner, idempotent sync, permission flow, troubleshooting screen, notification "Mark done"
- Theming: system/light/dark, accents, compact/comfortable density, Dynamic Type, accessibility labels/actions
- Export: JSON backup, CSV, daily automatic local backups (7 kept), merge-restore
- Backend: migrations, RLS, LWW triggers, sync engine, email auth (sign up/in/out, reset, session restore), guest migration, account deletion, local data erase
- AI planner (Edge Function) with template fallback; RevenueCat paywall/restore/webhook; remote plan limits

**Deferred (not implemented — do not advertise)**

- **Home-screen widgets and quick actions.** `expo-widgets` (iOS, dev build only, `@expo/ui/swift-ui`) is the intended path; Android widgets would need a config plugin/native module. Not built because they can't be verified here.
- Background refresh of the reminder window (`expo-background-task`) for users who don't open the app for 2+ weeks.
- Sync realtime subscriptions (sync runs on change/foreground/backoff instead).
- Social sign-in providers; email change; magic links.
- Ads (intentionally none in the MVP).
- Localisation of UI strings (dates/numbers are already locale-formatted via `Intl`).
- Web build.

## Production-readiness checklist

- [ ] Replace placeholder app icons/splash (`assets/`), set real `bundleIdentifier`/`package`, version and build numbers
- [ ] Create `eas.json` profiles; configure EAS environment variables per profile
- [ ] Supabase: apply migrations, enable email confirmations, configure SMTP, set redirect URLs, deploy functions, set secrets, run `supabase test db`
- [ ] Enable leaked-password protection and rate limits in Supabase Auth
- [ ] RevenueCat: products, offering, entitlement `premium`, webhook, sandbox purchase + restore on both stores
- [ ] Publish privacy policy & terms; set `EXPO_PUBLIC_PRIVACY_POLICY_URL` / `EXPO_PUBLIC_TERMS_URL`; complete App Store privacy labels and Play Data safety form
- [ ] Verify reminders on physical iOS and Android devices (locked screen, Focus/Doze, reboot, time-zone change)
- [ ] Run Maestro flows on both platforms; manual accessibility pass (VoiceOver, TalkBack, 200% text)
- [ ] Add crash reporting (e.g. Sentry via its Expo config plugin) and decide on privacy-respecting analytics (none included)
- [ ] Load-test history size (2+ years × 30 habits) on a low-end Android device; consider windowed completion queries if needed
- [ ] Set up CI: `npm test`, `npm run typecheck`, `npm run lint`, `npx expo-doctor`
- [ ] Configure EAS Update channels for OTA fixes
