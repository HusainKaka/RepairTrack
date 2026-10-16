# RepairTrack foreground component system

## Product direction

The workshop ledger puts the job, reported problem, stage and next permitted action ahead of decorative metrics. Lists are working records; detail pages are case workspaces. Existing Aura colors, glass surfaces, full branding and background effects are retained.

## Protected boundary

Do not modify `web/src/theme.ts`, `web/src/styles.css`, `web/src/components/BrandBackdrop.tsx` or the brand image assets for this redesign. `BrandBackdrop` remains the original sibling of the router in `main.tsx`; no new ancestor transform, isolation, overflow or positioning is introduced. The published scene identifier, pinned runtime/SRI, pointer fallback, canvas layering, responsive rules and reduced-motion/transparency behavior remain in those frozen files.

Baseline SHA-256 hashes and synthetic screenshots are stored outside the Git checkout in the workspace `.build/premium-ui/before` directory. Compare protected hashes again before approving any release. Animation frames are time-dependent; preserved source and settings do not imply identical pixels captured at different moments.

### Frozen background implementation inventory

| Control | Preserved implementation |
|---|---|
| Placement and stacking | Original `BrandBackdrop` sibling of `BrowserRouter`; fixed inset backdrop, z-index −1, pointer-events none; existing relative/isolate root remains unchanged |
| Scene | Published Unicorn scene `ty3N7ZPaIU7KlWixQFIc`; pinned SDK 1.4.29 and existing SRI; original canvas opacity 0.8 and mask gradient |
| Ambient geometry | Blue: top −12%, left −12%, 52vw, 7.5rem blur; sky: bottom −18%, right −10%, 62vw, 8.75rem blur; white: top 36%, left 36%, 30vw, 5rem blur |
| Ambient materials | Original blue `rgba(191,219,254,.35)`, sky `rgba(186,230,253,.22)` and white `rgba(255,255,255,.55)`; existing blend/mask/layer order |
| Grid | Existing dot layer inset −4rem, opacity .22 and 32px radial grid |
| Drift | Existing no-preference animation durations 26/32/30/38 seconds; no added parent transforms or retiming |
| Pointer fallback | Existing pool of 12 spans, 180px diameter, 90ms throttle, 1700ms ease-out, scale .12 → 1.8 and opacity .42 → 0; no touch trail; only when the original runtime is unavailable |
| Preferences | Existing reduced-motion and reduced-transparency runtime behavior unchanged; foreground transitions respect reduced motion independently |

The authoritative geometry, responsive rules, gradients, easing and preference behavior remain in the frozen source, not duplicated CSS. Hash checks cover the whole files, not just the values listed above. The existing external runtime can fall back when WebGL or its network dependency is unavailable; do not replace that behavior for screenshots.

## Tokens and surfaces

The separate `web/src/product.css` layer is scoped to `.product-ui`. It must never target `body`, `#root`, `.brand-backdrop`, its scene or ambient layers.

| Role | Existing source / foreground alias | Usage |
|---|---|---|
| Primary text | `--brand-ink` → `--product-text` | Job identity, problems, important values |
| Supporting text | `--brand-muted` → `--product-muted` | Labels, context and timestamps |
| Glass panel | `--glass-surface` → `--product-surface` | Dominant workspace or grouped section |
| Solid foreground fallback | `--glass-solid` → `--product-surface-solid` | Existing reduced-transparency/fallback behavior |
| Panel edge | `--glass-border` → `--product-edge` | Aura highlights and panel boundaries |
| Action/focus | Existing `primary.dark` | Links, selected tab text and focus rings |
| Spacing | 4, 8, 12, 16, 24, 32px | Fine adjustment, control groups, sections |
| Radius | Existing 24px panel / 12px input | Preserve Aura geometry; buttons retain the existing pill shape |

Keep the existing Inter/system font stack. Page titles are semantic `h1` elements, normally 28–32px; section titles are approximately 18–24px. Body copy is generally 14–16px, with 12px contextual labels. Dates and financial values use tabular figures. Status labels use readable sentence case and text as well as color. Warning text uses existing ink where the lighter semantic warning shade is insufficiently legible.

Do not add blur to every surface, import a replacement palette/font, or use one-off gradients to distinguish ordinary sections.

## Shared primitives

| Component | Contract |
|---|---|
| `PageHeader` | One semantic page title, concise context and a wrapping action area; one primary action per task |
| `DataTable` / `ProductTable` | Stable optional row keys, caption, labelled mobile records and pagination of supplied rows only |
| `FormDialog` / `ProductFormDialog` | Semantic form, visible labels, accessible validation summary with field focus links, pending lock, error focus and dirty-close confirmation |
| `KeyValue` | Label/value grouping; preserves numeric zero and wraps long values |
| `StatusChip` | Real status text, readable contrast using existing tokens, no meaning communicated solely by color |
| `LoadingBlock` | Immediately displays actual request progress, with a polite status announcement; no artificial minimum wait |
| `ErrorBlock` | Explains failure and offers retry where the caller supports it |
| `EmptyState` | Distinguishes no records from no matching results; useful real next action where available |

The generic table retains its existing columns/rows API. Optional `caption`, `rowKeys`, `mobileSummaryColumns`, `pageSize` and `paginated` props add purpose without changing data contracts. Its pagination is explicitly labelled **loaded** rows; it is not backend pagination. Businesses use their genuine server pagination separately.

Repair lists use a dedicated `RepairLedger` because device, issue, customer, ownership and priority deserve a task-specific mobile arrangement. Only one responsive presentation tree is rendered. Ordinary priority does not compete with exceptional High/Urgent work.

### Readable records at intermediate widths

Viewport presets alone are not a reliable table breakpoint: a 1024px laptop with the permanent sidebar has substantially less space for the records. `useRecordLayout` observes the actual foreground panel width and selects compact records when the configured table minimum is unavailable. It disconnects its observer on unmount and has a window-resize fallback. Repair/device/team ledgers require 1000px of panel space, inventory 960px; other tables derive a conservative default from their column count. Large desktops retain tables, phones retain single-column records, and intermediate repair panels use a two-column job grid where space permits.

`RecordName` presents device, customer, technician and inventory names on at most two visual lines with normal word wrapping. Full values remain in the DOM, accessible link names and native hover titles; data is never shortened in the API or edited to fit. Status chips retain complete textual meaning, natural height, protected color tokens, a 192px maximum and enough preferred width for long labels to occupy one or two lines. Their 12px corner treatment avoids oversized circular capsules. Never reintroduce paragraph `overflow-wrap:anywhere` into table identity sizing or use page-level clipping to conceal cramped columns.

## Interaction states

| State | Behavior |
|---|---|
| Default / hover | Existing Aura control materials and MUI feedback; no decorative hover lift on routine work |
| Focus | Visible foreground focus ring, native keyboard order and labelled icon actions |
| Active / selected | Clear current navigation, tab and filter state; URL-backed working context where implemented |
| Disabled | Genuine permission, pending or validation constraint—not a decorative inactive control |
| Loading / refresh | Immediate progress; retain the current view during safe background refresh |
| Invalid | Field guidance or linked validation summary plus actionable server failure; preserve entered values |
| Success | Describe the recorded outcome accurately; do not equate provider acceptance with customer receipt |
| Destructive | Explain the effect and require an explicit confirmation/reason where supported |

Dialogs use short existing MUI transitions and zero-duration transitions under reduced-motion preference. No animation library was added. Frequent route navigation no longer replays a page entrance animation. Background motion is not changed.

Legacy money inputs did not impose the browser's implicit `step=1`. The shared form intentionally preserves that decimal behavior while respecting explicit required, email, length, min/max, pattern and step constraints. Financial validation and cents-based calculations remain authoritative in their existing functions and backend.

## Permission and data boundaries

- Business administrators manage intake, directory mutations, stock, billing and business settings.
- Technicians retain their existing assigned-job actions and read-only directory access. Invoice summaries do not link to routes their role cannot open.
- Customers see only their existing owned records and customer-visible updates. No private tracking share controls or internal notes are added.
- Platform administration remains separate from business operations.
- Repair, customer, device, digital, invoice and notification lists have existing backend caps; audit is latest 200, expenses up to 500. Display scope honestly.
- Digital invoices stay manual. Using repair inventory parts retains the existing stock and draft-invoice side effects. Approval versions, status transitions, KRA gating and totals are unchanged.
- Recurring expense metadata does not imply scheduled payments. Subscription checkout still requires an actual provider adapter; the UI does not fabricate activation.

## Preview and verification

`web/preview` and `web/scripts` provide a loopback-only synthetic preview and repeatable browser checks. They are not imported by the application or included in the production bundle. The demo's role simulation is not a production authentication implementation. Never enter real customer information into the preview.

Test unit behavior, role-specific visibility, failed/pending mutations, responsive layouts, keyboard dialog behavior, long/incomplete data and protected hashes. Automated axe and emulated text/viewport checks supplement—not replace—manual screen-reader and real-device testing. Record measured local performance separately from production network performance, and report unresolved limitations without invented scores.

Implementation and preview are local only. No commit, push, merge, publication or deployment is authorized until the user explicitly approves the reviewed result.
