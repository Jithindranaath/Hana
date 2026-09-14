# Brand — Hana Network

_Status: active_

Single source of truth: `packages/shared/tailwind-preset.js`. All four apps (`hana-ctc-checkout`,
`hana-ctc-store`, `hana-ctc-merchant`, `hana-ctc-docs`) consume it as a Tailwind preset, so a token
changed there changes everywhere. **Never hardcode a hex value or an off-scale pixel number in a
component** — if a colour isn't in the preset, add it to the preset.

## Positioning

Hana is a credit *primitive*, not a consumer finance app. The UI should read like precise
instrumentation — a terminal for on-chain credit — rather than a fintech brochure. Dark-committed
by design; there is one palette, not a light/dark pair (`color-scheme: dark` is set in `addBase`).

## Palette

Cool-grey ground, violet → cyan accent. Violet reads as trust/credit, cyan as proof/verification;
the gradient between them is the brand's single recognisable gesture.

| Token | Hex | Use |
|---|---|---|
| `base` | `#07080C` | Page ground |
| `surface` | `#0D0F16` | Cards, panels |
| `surface-2` | `#141824` | Inputs, raised rows, skeletons |
| `surface-3` | `#1B2030` | Hover on raised elements |
| `line` | `#1E2331` | Default 1px borders |
| `line-strong` | `#2A3142` | Input borders, dividers needing weight |
| `fg` | `#E8EAF0` | Primary text (softened white — never `#FFF`, it glares) |
| `fg-muted` | `#9AA3B8` | Secondary text — 7.2:1 on base |
| `fg-subtle` | `#7C8699` | Tertiary / captions — 4.8:1 on base, the dimmest that ships |
| `accent` | `#7C5CFF` | Primary action, focus ring, active state |
| `accent-hi` / `accent-lo` | `#9B85FF` / `#5B3FE8` | Accent text on dark / pressed |
| `aqua` | `#22D3EE` | Gradient terminus, inline code |
| `pos` | `#34D399` | Score up, paid, claimed, yield |
| `warn` | `#FBBF24` | Pending, testnet marker, attestation wait |
| `neg` | `#FB7185` | Overdue, liquidated, errors |

Semantic colours carry semantic meaning only. `warn` is reserved for the testnet chip and
in-flight states — it must never be decorative, or the network marker stops registering.

### Gradients

`grad-accent` (135°) and `grad-accent-r` (90°) are the brand gesture — primary buttons, the logo
mark, active nav underlines, chart fills, and `gradient-text` on exactly one phrase per page.
`grad-mesh` + a ~3% noise overlay (`.surface-mesh`) is the ambient page wash; the noise exists
because wide low-opacity radials band badly on 8-bit displays.

**Restraint rule:** one gradient-text phrase per screen. Two competing gradient headlines is the
fastest way to make this look like a template.

## Typography

- **UI:** Inter via `next/font/google`, exposed as `--font-sans`.
- **Numerals & code:** JetBrains Mono, `--font-mono`, always with `tabular-nums` (the `.mono`
  class applies both). **Every number that updates in place must use it** — scores, token
  amounts, addresses, elapsed timers — so digits never jitter.
- Headings carry `tracking-display` (-0.028em). Tight tracking on large type is most of what
  separates "designed" from "default Tailwind".
- Body stays at default tracking. Never go below 12px.

## Shape and depth

One radius per element class, no mixing: cards `rounded-card` (14px), controls `rounded-ctl`
(8px), chips fully round. Borders are 1px. This is a **flat, bordered** system — shadows are for
overlays (`shadow-pop`) and the accent glow on primary actions only, never stacked with a border
for ordinary separation.

## Motion

Durations come from a fixed vocabulary: 100ms (hover/press feedback), 150ms (small enter),
200–250ms (element enter/exit), 500ms cap. `ease-out` entering, `ease-in` leaving. Never
`transition: all` — always name the properties.

Motion must communicate something. The three animations that earn their place:
- **Score count-up** (480ms, ease-out cubic) — the 300 → 788 import payoff is the product's
  emotional beat and needs to be legible on camera.
- **Attestation `breathe`/`ring-out`** — a ~9-minute wait; a spinner reads as hung, a slow pulse
  reads as working.
- **`fade-rise` on first mount** — never on refetch, where it becomes a speed bump.

`prefers-reduced-motion: reduce` removes motion rather than shortening it, enforced globally in
the preset's `addBase` and reinforced with `motion-safe:` variants per component.

## Voice

Concise, active, specific. Say what a thing does, never what the user could do.
"Draw and stake", not "Click here to draw". "No loans yet" plus the next action, never "No data".
State honest limits plainly — "Typically ~9:20 end to end" beats a spinner and a promise.

Never claim integration, partnership, or endorsement (Credal/Gluwa especially).

## Accessibility floor

Non-negotiable, checked before any surface ships: AA contrast (4.5:1 body, 3:1 large/icons);
one brand-coloured focus ring on every interactive element, never the browser default; real
`<button>`/`<a>`, never `<div onClick>`; 40px minimum hit target; every data view implements
loading (skeleton, content-shaped), empty (with a next action), and error (with recovery).
