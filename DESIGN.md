# Concreat Hub — Design System

Source of truth for look and feel: the wireframe `docs/Standard_Portal_Flow_v47_ForDevBuildGuide.html` (v47). This file extracts its style guide and maps every pattern onto **shadcn/ui** components. Tokens live in `src/styles/theme.css`; components live in `src/ui/`.

**Rules**

1. **shadcn first.** Use a shadcn component for every control (button, input, select, checkbox, dialog, tabs, table…). Never ship a raw `<input>`, `<select>`, `<button>` or `<table>` styled by hand. If shadcn has no component for it, build it in `src/ui/` from shadcn primitives.
2. **Restyle through tokens, not per-use classes.** shadcn components already read `bg-primary`, `border-border`, `bg-accent`… which map to the wireframe palette. When a shadcn default differs from the wireframe (radius, ghost colour), change the component file in `src/ui/` once — don't patch it at each call site.
3. **Build to the wireframe.** Same labels, copy, field order, dropdown values. Don't redesign; flag gaps.
4. **Never hardcode hex values** in components. The only exception is the fixed-palette sign-in/activation screens (§7).

---

## 1. Colour tokens

Wireframe name → shadcn token (CSS variable) → Tailwind utility.

| Wireframe   | Token (`theme.css`)                    | Utility                                  | Light     | Dark        | Use                                         |
| ----------- | -------------------------------------- | ---------------------------------------- | --------- | ----------- | ------------------------------------------- |
| `--bg`      | `--background`                         | `bg-background`                          | `#F5F8FB` | `#10161D`   | Page background                             |
| `--surface` | `--card`, `--popover`                  | `bg-card`, `bg-popover`                  | `#FFFFFF` | `#161F29`   | Cards, tables, dialogs, inputs              |
| `--surface-2` | `--muted`, `--secondary`             | `bg-muted`, `bg-secondary`               | `#EEF2F6` | `#1D2732`   | Table header/footer, row hover, read-only fields, meta panels |
| `--border`  | `--border`, `--input`                  | `border-border`, `border-input`          | `#DCE3EA` | `#2B3948`   | All borders and dividers                    |
| `--ink`     | `--foreground`                         | `text-foreground`                        | `#17222E` | `#E7ECF1`   | Body text, values                           |
| `--ink-muted` | `--muted-foreground`                 | `text-muted-foreground`                  | `#5B6B7C` | `#98A7B7`   | Labels, captions, secondary text            |
| `--ink-faint` | `--faint`                            | `text-faint`                             | `#8B98A6` | `#6E7C8C`   | Eyebrows, table headers, footnotes, empty states |
| `--accent`  | `--primary`, `--ring`                  | `bg-primary`, `text-primary`, `ring-ring` | `#2560A8` | `#6FA8DC`   | Primary buttons, links, active tab, focus   |
| `--accent-ink` | `--primary-foreground`              | `text-primary-foreground`                | `#FFFFFF` | `#0B1621`   | Text on primary                             |
| `--accent-soft` | `--accent`                         | `bg-accent`                              | `#E7EFF9` | `#1E3149`   | Active nav pill, selected segment, ghost hover, neutral pill, announcement |
| `--accent-soft-ink` | `--accent-foreground`          | `text-accent-foreground`                 | `#1E4D82` | `#BFDBF7`   | Text on accent-soft                         |
| `--good` / `--good-soft` | `--success` / `--success-soft` | `text-success` / `bg-success-soft` | `#227A50` / `#E4F3EA` | `#79C99A` / `#16302380` | Completed, invoiced, resolved |
| `--warn` / `--warn-soft` | `--warning` / `--warning-soft` | `text-warning` / `bg-warning-soft` | `#9A6400` / `#FBF1DC` | `#E4B34C` / `#3A2E1180` | Pending, in review, awaiting approval |
| `--bad` / `--bad-soft`   | `--destructive` / `--destructive-soft` | `text-destructive` / `bg-destructive-soft` | `#B3261E` / `#FAE7E6` | `#E5877F` / `#3A1B1980` | Errors, declined, overdue |
| `--shadow`  | `--shadow-card`                        | `shadow-card`                            | see `theme.css` | see `theme.css` | Cards, tables, stat tiles, dialogs |
| `--scrim`   | `--scrim`                              | `bg-scrim`                               | `rgb(23 34 46 / .4)` | `rgb(4 7 10 / .6)` | Dialog / sheet overlay |

> Naming trap: the wireframe's `--accent` is shadcn's **`primary`**; shadcn's **`accent`** is the wireframe's `--accent-soft`.

**Dark mode.** The wireframe ships a dark palette (prefers-color-scheme, overridable with `data-theme`). `theme.css` currently enables it only via `<html data-theme="dark">`. Light is the default; don't build a theme switcher unless the wireframe adds one.

---

## 2. Typography

- **Sans:** IBM Plex Sans (400/500/600/700, 800 for brand screens only) → `font-sans` (default on `body`).
- **Mono:** IBM Plex Mono (400/500/600) → `font-mono`. Use for **identifiers and machine values**: SO numbers, PO refs, ship-to codes, Trip IDs, Blanket SO numbers, request/complaint refs, dates in tables, amounts in tables.
- **Numbers:** amounts and quantities use `font-mono tabular-nums text-right`.
- Base size is **13.5px** for body, table cells, inputs and buttons (the wireframe's dense, data-first scale).

| Role                        | Size    | Weight | Extra                                        | Tailwind                                                    |
| --------------------------- | ------- | ------ | -------------------------------------------- | ----------------------------------------------------------- |
| Page title / greeting       | 22px    | 700    | `tracking-[-0.01em]`, `text-balance`         | `text-[22px] font-bold tracking-tight`                      |
| Panel heading (`h1` per tab)| 19px    | 700    |                                              | `text-[19px] font-bold`                                     |
| Dialog title                | 17px    | 700    |                                              | `text-[17px] font-bold`                                     |
| Announcement title / total  | 16px    | 700    |                                              | `text-base font-bold`                                       |
| Stat value                  | 26px    | 700    | `leading-tight`                              | `text-[26px] font-bold leading-tight`                       |
| Tab / nav label             | 14.5 / 13px | 600 | active nav pill 800                         | `text-[14.5px] font-semibold` / `text-[13px] font-semibold` |
| Body, cells, inputs, buttons| 13.5px  | 400 / 600 (buttons) |                                 | `text-[13.5px]`                                             |
| Panel caption, help text    | 13px    | 400    | `text-muted-foreground`, max `62ch`          | `text-[13px] text-muted-foreground max-w-[62ch]`            |
| Form label                  | 12.5px  | 600    | `text-muted-foreground`                      | `text-[12.5px] font-semibold text-muted-foreground`         |
| Pill / badge                | 12px    | 600    |                                              | `text-xs font-semibold`                                     |
| Footnote, summary note      | 12px    | 400    | `text-faint`, `leading-normal`               | `text-xs text-faint`                                        |
| Eyebrow, table header, card section heading | 11.5px (table/eyebrow) · 13px (card `h2`) | 600–700 | UPPERCASE, `tracking-[0.04–0.08em]`, `text-faint` (card `h2`: `text-muted-foreground`) | `text-[11.5px] font-semibold uppercase tracking-wider text-faint` |

If an arbitrary size repeats in three or more places, add it as a `--text-*` token in `theme.css` instead of repeating `text-[13.5px]`.

---

## 3. Shape, elevation, spacing, layout

**Radius**

| Element                          | Wireframe | Token / utility   |
| -------------------------------- | --------- | ----------------- |
| Buttons, inputs, selects, small tags | 6px   | `rounded-md`      |
| Segmented toggle, meta panels, inline notes | 8px | `rounded-lg`   |
| Cards, tables, stat tiles, announcement | 10px | `rounded-xl`   |
| Dialogs                          | 12px      | `rounded-2xl`     |
| Pills, nav pills, badges, avatar | full      | `rounded-full`    |

`theme.css` sets `--radius-md: 6px`, `--radius-lg: 8px`, `--radius-xl: 10px`, `--radius-2xl: 12px` so shadcn's defaults (`rounded-md` on Button/Input) land on the wireframe values. When adding a shadcn **Card** or **Dialog**, set them to `rounded-xl` / `rounded-2xl` in the component file.

**Elevation:** one shadow, `shadow-card`, on cards, tables, stat tiles and dialogs. Hover on clickable tiles uses `hover:shadow-md`. No other shadows.

**Spacing**

- Page gutter: `px-[clamp(16px,4vw,40px)]`, `pt-5 pb-12`. Content max width **1180px** (`max-w-[1180px] mx-auto`).
- Card padding 18px (`p-[18px]`); stat tile `px-5 py-[18px]`; dialog 22px.
- Vertical rhythm between blocks: 14–24px (`gap-3.5` toolbar → table, `mb-4` panel head, `gap-5` card columns).
- Form rows: label → control gap 5px, rows 14px apart (`gap-1.5`, `mb-3.5`).

**Breakpoints** (wireframe values; use Tailwind arbitrary breakpoints only where these differ from defaults)

| Width   | Behaviour                                                        |
| ------- | ---------------------------------------------------------------- |
| ≤ 900px | One-row toolbars wrap                                            |
| ≤ 760px | New Order two-column grid (`1fr 320px`) stacks; summary moves below |
| ≤ 600px | Two-column field grids become one column                         |

Tables scroll horizontally inside their wrapper (min width 640px; `tight` tables 560px) — never shrink columns into unreadability.

**Focus:** every interactive element shows `outline-2 outline-ring outline-offset-2` on `:focus-visible` (shadcn's `focus-visible:ring-*` is acceptable as long as it uses `--ring`).

---

## 4. App shell

| Wireframe                       | Build with                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Top bar**: logo mark (30px conic ring) + "Concreat Connect" (15.5px/700) + sub-line (11.5px, faint); right side: account name + user chip | `layout/AppShell.tsx`. Logo is an inline SVG component in `src/ui/Logo.tsx`. User chip = shadcn **Avatar** (26px, `bg-primary text-primary-foreground`, initials 11px/700) inside a **DropdownMenu** (profile, sign out). |
| Account switch ("Change" link next to the account name) | Phase 2 only. Button `variant="link"`; opens a **Dialog** with the account picker (§7). Hidden while one link per contact. |
| **Section nav**: rounded pills (Dashboard, Orders, …), active = `bg-accent text-accent-foreground font-extrabold` with a 3px glowing underline | React Router `NavLink` styled as pills (this is routing, not shadcn Tabs). Underline is an `after:` pseudo-element: `after:absolute after:inset-x-3.5 after:-bottom-2 after:h-[3px] after:rounded-full after:bg-primary after:shadow-[0_0_6px_1px_var(--primary)]`. Inactive: `text-muted-foreground hover:bg-muted hover:text-foreground`. Hide items the role can't use (UX only). |
| "Soon" tag on disabled sections | **Badge** `variant="soon"` (10px uppercase, `bg-muted text-faint`); item `opacity-55`, not clickable. |
| Help link                       | Button `variant="ghost"` opening the Help **Dialog** (topics list + numbered guides). |
| **In-page tabs** (e.g. Orders: All / Pending Approval / Drafts) with count badge | shadcn **Tabs**, restyled as underline tabs: list has `border-b`, trigger is 14.5px/600 `text-muted-foreground`, active `text-primary border-b-2 border-primary` (no pill background). Count = **Badge** `variant="count"` (18px high, `bg-accent text-accent-foreground`, 11px/700). |
| Panel head: `h1` + caption on the left, primary action(s) on the right | Small `PageHeader` component in `src/ui/`. |
| Page footnote                   | `<p>` 12px `text-faint`, `border-t pt-3.5 mt-8`. |

---

## 5. Component mapping (wireframe → shadcn)

### Actions

| Wireframe class   | shadcn                                   | Notes                                                                          |
| ----------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| `.btn-primary`    | `Button` (`variant="default"`)           | `bg-primary`; hover `brightness-110` instead of shadcn's `/90` opacity.        |
| `.btn` (secondary)| `Button variant="outline"`               | `bg-card border-border`, hover `bg-muted`.                                     |
| `.btn-ghost` (row actions: View, Reorder, Download) | `Button variant="ghost"` | Wireframe ghost text is **primary blue** with `hover:bg-accent`. Applied in `src/ui/button.tsx` (`text-primary hover:bg-accent`), along with the 13.5px/600 label, outline `bg-card hover:bg-muted` and primary `hover:brightness-110`. |
| Disabled          | built-in `disabled`                      | Wireframe uses 45% opacity; shadcn's 50% is fine.                              |
| `.removeline` (×) | `Button variant="ghost" size="icon"` + Lucide `X` | `text-faint hover:text-destructive`; always add `aria-label`.         |
| Button sizes      | default height 36px, `px-4`, 13.5px/600, icon gap 7px | Use `size="sm"` only inside table rows.                          |

### Forms (React Hook Form + Zod + shadcn Field/Form)

Every form uses shadcn's form pattern (`Field` / `FieldLabel` / `FieldDescription` / `FieldError`, or `Form` + `FormField` if the installed version uses that) wired to React Hook Form with a Zod schema. Labels are 12.5px/600 muted, above the control.

| Wireframe                                | shadcn                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `.formrow input` (text, email, phone)    | `Input` — 13.5px, `px-[11px] py-[9px]` (≈ 38px), `rounded-md`, `bg-card`.               |
| `.formrow textarea`                      | `Textarea` — min height 64px, vertical resize.                                          |
| `.formrow select`, `select.plain` (filters) | `Select` (short fixed lists: status, type, shipment method). Keep option labels exactly as the wireframe. |
| Long or searchable lists (item/product on an order line, delivery site, request type) | **Combobox** = `Popover` + `Command`.                    |
| `input[type=date]` (receiving date, ledger From/To) | **Date picker** = `Popover` + `Calendar`; format with date-fns. Ranges use one `Calendar mode="range"`. |
| Time window                              | `Select` with the wireframe's fixed windows.                                            |
| `.checkrow` (checkbox + label)           | `Checkbox` + `Label` in a flex row, gap 8px, 13.5px/500.                                |
| Radio choices (contact method, consent)  | `RadioGroup`.                                                                           |
| `.ordertype-toggle` / `.seg-btn` (Delivery / Pick up; Single / Blanket) | `ToggleGroup type="single" variant="outline"`; selected = `bg-accent text-accent-foreground`, container `rounded-lg`. |
| `.field-inline` (search box with icon in toolbars) | `Input` with a leading Lucide `Search` icon (`InputGroup` if available, else a relative wrapper + `pl-8`). `flex-1 min-w-[200px]`. |
| `.bc-readonly` (values that come from BC: price, freight, credit) | `Input readOnly` with `bg-muted text-muted-foreground`; inside order lines, borderless. Customers must see they can't edit it. |
| Line-item cells (`.linecell-qty`, `.linecell-price`, `.charge-input`) | Compact `Input` (`h-8 text-right tabular-nums`; qty 66px, price 76px, charge 100px). |
| File upload (+ New Multiple Order, request/complaint attachments) | No shadcn primitive: build `src/ui/FileDrop.tsx` from a visually hidden `<input type="file">` + `Button variant="outline"` + file list. Enforce the wireframe's accepted types (`.xls/.xlsx` for orders). |
| Validation errors                        | `FieldError` text 12px `text-destructive` under the control; control gets `aria-invalid` (shadcn styles the red border). |
| Toolbar (filters row above a table)      | `flex flex-wrap items-center gap-2.5 mb-3.5`; one-row variant `md:flex-nowrap`.         |

### Data display

| Wireframe                          | shadcn                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `.tablewrap` + `table`             | shadcn `Table` rendered by **TanStack Table**, wrapped in `rounded-xl border bg-card shadow-card overflow-x-auto`. Build one `DataTable` in `src/ui/` and reuse it. |
| `thead th`                         | 11.5px/600 UPPERCASE `tracking-wider text-faint bg-muted px-4 py-[11px] whitespace-nowrap`. Optional sub-label (`.th-sub`) normal case. |
| `tbody td`                         | 13.5px, `px-4 py-[13px]`, `border-b` (none on last row), row hover `bg-muted`. Numeric columns `text-right font-mono tabular-nums`. |
| `tfoot` (totals)                   | `TableFooter`: 13px/600 `bg-muted border-t`.                                                     |
| Empty row ("No orders match your filters.") | Single cell spanning all columns, centred, `text-faint py-[26px]`. Reuse an `EmptyState` component. |
| `.rowactions`                      | Last column, right-aligned, ghost buttons.                                                       |
| `.pager` ("Showing 1–10 of 42" + Prev/Next) | `Pagination` (or two outline `size="sm"` buttons) — 12.5px `text-muted-foreground`, `mt-3`, page size 10. |
| `.pill` status                     | `Badge` with custom variants `good · warn · bad · neutral · progress` (see §6). Pill = `rounded-full px-2.5 py-[3px] text-xs font-semibold` + 6px `currentColor` dot (`before:` pseudo-element). Wrap as `StatusPill`. |
| `.ship-badge` (D / P circle)       | 22px round `Badge` `bg-accent text-accent-foreground` 11px/700 + `Tooltip` with the full word (Delivery / Pick up). |
| `.bc-tag` (Single / Blanket)       | Small `Badge` `rounded-sm px-1.5 text-[10.5px] bg-accent text-accent-foreground`.               |
| `.card` + card `h2`                | `Card` (`rounded-xl shadow-card p-[18px]`); section heading 13px/700 UPPERCASE `tracking-wide text-muted-foreground mb-3.5`. |
| `.stat-tile` (Dashboard factboxes) | `Card` with `border-l-[3px]`: label 13px/600 muted → value 26px/700 → caption 12px faint. Variants: `alert` (`border-l-destructive`, value red), `warn`, `clear` (`border-l-success`, caption green), `progress` (`border-l-primary`). Clickable tiles are `<button>`s/links with a primary-coloured caption and `hover:border-primary`. Grid `grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5`. |
| `.summary-row` (order totals)      | Flex row, 13.5px muted, `border-b py-[7px]`; total row 16px/700 `text-foreground`. Amounts only **display** BC values (no business maths in the SPA). |
| `.announcement-banner`             | `Alert` restyled: `bg-accent border-l-4 border-l-primary rounded-xl`; eyebrow 11px uppercase `text-accent-foreground`, title 16px/700, message 13px muted. |
| `.trip-id-note` pending / ready    | `Alert` with `bg-warning-soft text-warning` / `bg-success-soft text-success`, `rounded-lg`. |
| `.modal-meta` (key/value grid in dialogs) | `dl` grid `grid-cols-2 gap-x-5 gap-y-2.5 bg-muted rounded-lg px-4 py-3.5`; key 11px/600 uppercase faint, value 13.5px. |
| Separator / `.help-divider`        | `Separator`.                                                                                     |
| Money                              | `Money` component → `lib/format.ts` `peso()`: `₱` + `en-PH`, 2 decimals; negatives `-₱1,234.00`. |
| Dates                              | `lib/format.ts` with date-fns. Tables show short dates (`Sep 2`, `MMM d`); detail views full date. `—` for missing. |

### Overlays & feedback

| Wireframe                    | shadcn                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `.modal-overlay` + `.modal-panel` (View order, Help, New Multiple Order…) | `Dialog`: `max-w-[720px] rounded-2xl p-[22px] shadow-card`, overlay `bg-scrim`, `max-h-[calc(100vh-40px)] overflow-y-auto`. Actions right-aligned in `DialogFooter` (`gap-2.5 mt-[18px]`). |
| Destructive / irreversible confirm (cancel draft, remove site) | `AlertDialog`.                                   |
| Toasts (submitted, saved, errors) | **Sonner** (`toast.success`, `toast.error`) — already mounted in `main.tsx`.       |
| Inline hints on icons/badges | `Tooltip`.                                                                              |
| Mobile nav / long side content | `Sheet` (only if the wireframe's layout calls for it on small screens).              |
| Loading                      | `Skeleton` rows in tables and tiles; `Spinner`/Lucide `Loader2 animate-spin` inside buttons while submitting (and disable the button). |

---

## 6. Status colours

One `StatusPill` component, one mapping per domain. Unknown status → `neutral`.

| Domain               | neutral (`bg-accent text-accent-foreground`) | progress (`bg-primary text-primary-foreground`) | warn (`bg-warning-soft text-warning`) | good (`bg-success-soft text-success`) | bad (`bg-destructive-soft text-destructive`) |
| -------------------- | ------------------ | -------------------- | -------------------------------------------------- | ----------------------------------- | ------------ |
| Sales orders         | Open               | Ready for Dispatch   | Pending Prepayment, Awaiting credit approval       | Completely Shipped, Invoiced        | Declined     |
| Ledger entries       | —                  | —                    | Open                                               | Closed                              | —            |
| Requests / Complaints| Submitted          | —                    | In Review                                          | Resolved                            | —            |
| Site requests / approvals | Not Started   | —                    | In review                                          | Approved, Submitted                 | Rejected     |

Never show BC's internal status names; map them in the Server Logic layer (see CLAUDE.md order status mapping).

---

## 7. Sign-in, activation, account picker (fixed brand palette)

These screens **don't follow light/dark** — they stay on-brand like a product splash. Use dedicated brand tokens (add to `theme.css` as `--brand-*` when the screens are built), never inline hex in components.

| Token            | Value                                   | Use                                     |
| ---------------- | --------------------------------------- | --------------------------------------- |
| `--brand-navy`   | `#1B2E63`                               | Sign-in button, gradient start          |
| `--brand-navy-deep` | `#0C1633`                            | Gradient end (`linear-gradient(160deg, navy, navy-deep)`) |
| `--brand-ink`    | `#16255A`                               | Logo word, headings                     |
| `--brand-blue`   | `#3E63B8`                               | Eyebrow, logo segment                   |
| `--brand-sky`    | `#9AD3EC`, `--brand-steel` `#A7ADB6`, `#142B63` | Logo conic ring segments       |
| `--brand-soft`   | `#EAF1FC`                               | Feature icon boxes, brand pills         |
| field border     | `#D7DCE2`; dividers `#EAEDF1`           |                                         |

Layout: two panels that wrap — left white panel (`flex-[1_1_560px]`, `p-[clamp(32px,5vw,64px)_clamp(24px,6vw,76px)]`) with logo row, eyebrow, heading (`clamp(28px,3.4vw,38px)`/800), tagline, lede, feature list (32px icon boxes, Lucide icons); right navy gradient panel (`flex-[1_1_420px]`) centring a white card (`max-w-[420px] rounded-[14px] p-[36px_34px] shadow-[0_20px_50px_rgba(0,0,0,0.35)]`).

- Card: title 23px/800 centred, sub 13px muted, `Input` fields (10×12px padding), full-width `Button` in `--brand-navy` (14px/700, 7px radius), "Forgot password" and "Activate" as `Button variant="link"`.
- **Power Pages local sign-in posts to `/SignIn`** (see CLAUDE.md gotchas) — the shadcn form must submit the field names Power Pages expects; don't replace the post with a JS-only flow.
- **Account picker** (Phase 2): `Command` with search + grouped list; each option = 36px round icon (`bg-[--brand-soft]`) + name 13.5px/600 + meta 11.5px faint; hover `border-primary`.

---

## 8. Iconography

- **Lucide React** only, `stroke-width` 1.8–2, size 16px in buttons/inputs, 18px in cards, 15px inside 32px feature boxes.
- Icons next to text inherit `currentColor`. Icon-only buttons need `aria-label`.
- The logo is the only custom SVG.

---

## 9. Content & accessibility

- Use the wireframe's copy verbatim (labels, button text such as "+ New Multiple Order", empty states, captions). Every page sets `document.title = "<Page> — Concreat Connect"`.
- No BC jargon in UI text (location codes, table names, internal service-centre system name).
- Colour is never the only signal: pills always carry text; stat-tile alerts change both colour and copy.
- Contrast: all token pairs above meet WCAG AA for their sizes; check any new pairing.
- Keyboard: every Dialog/Popover/Select/Combobox comes from shadcn (Radix) for focus trapping and arrow-key support — another reason not to hand-roll controls.

---

## 10. Adding a shadcn component — checklist

1. `npx shadcn@latest add <name>` (writes to `src/ui/`, per `components.json`).
2. Check radius, padding and font size against §3 and §5; fix them **in the component file**.
3. Make sure it uses tokens (`bg-card`, `border-border`, `text-muted-foreground`), not shadcn's raw neutrals.
4. Add a colocated test if you add behaviour (variants, StatusPill mapping, Money formatting).
