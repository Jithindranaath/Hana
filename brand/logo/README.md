# Hana logo

The mark is the credit-score gauge from the product itself — the same arc that renders on the
checkout profile page — knocked out of the brand gradient. It reads as "credit score" instantly
and ties the logo to the thing the app actually shows.

Gradient and palette come from `packages/shared/tailwind-preset.js` (violet `#7C5CFF` →
`#22D3EE` → a touch of `#34D399`), so the logo, the apps and the demo slides are one system.

## Files

| File | Size | Use |
|---|---|---|
| `primary.png` | 1024×1024, transparent | **Upload this for the DoraHacks submission.** |
| `primary-512.png` / `-256` / `-128` / `-64` | square, transparent | Favicons, avatars, small placements |
| `lockup.png` | 1600×600, dark ground | Horizontal mark + wordmark, for decks and headers |
| `alt-dark.png` | 1024×1024, transparent | Alternate: gradient gauge on a dark tile, for light backgrounds |

Transparent backgrounds mean the tile's own rounded corners stay clean on any page colour.

## Regenerating

The PNGs are rendered from the `.html` sources beside them:

```bash
cd brand/logo && python3 -m http.server 3011      # then screenshot the pages at their canvas size
```

Edit the SVG in the HTML and re-render; the smaller sizes are downscaled from `primary.png` with
`ffmpeg -vf scale=N:N:flags=lanczos` so every size is identical artwork.
