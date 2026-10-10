# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install      # install dependencies
npm run dev      # Vite dev server on http://localhost:3000 (auto-opens browser)
npm run dev:lan  # same, bound to every interface (--host) so a phone on the Wi-Fi can open it; no auto-open
npm run build    # production build, emitted to build/ (outDir override)
```

There is **no test runner, linter, or typecheck script** configured. `tsc` is not run by the build (Vite + SWC transpiles without type-checking), so type errors will not fail the build — verify changes by running the app.

## Source Layout

The live application lives entirely under **`src/`** (entry: `index.html` → `src/main.tsx`; `@` alias → `./src`). When adding or changing imports, verify the path resolves under `src/`.

## Architecture

A client-only React 19 SPA (no backend) for designing app icons and exporting iOS/Android asset ZIPs. State lives in `App.tsx` and flows down as props; persistence is `localStorage` only.

### Foreground kinds (icon / image / text)

The foreground is one of three **mutually exclusive** kinds, selected by `iconConfig.foregroundType`:

- `icon` — an Iconify icon; the id still lives in App state as `generatedIcon` (see below).
- `image` — a user upload stored as a data URL in `iconConfig.imageDataUrl` (`utils/imageImport.ts` caps rasters at 1024 px and sanitizes SVGs). `imageTint` routes the foreground color/gradient through the image's alpha.
- `text` — `iconConfig.text` rendered in a Fontsource font (`textFontId`/`textFontFamily`/`textWeight`/`textItalic`/`textLetterSpacing`).

`utils/foreground.ts` is the single chokepoint: `resolveForeground(config, iconUrl)` returns a discriminated union (or `null` when nothing is selected) and every consumer branches on `kind`. `getForegroundScale` applies the Iconify optical multiplier only to icons; `getGlyphFill` derives the solid/gradient/silhouette fill. Switching kinds keeps the other kinds' state so users can flip back.

`utils/foregroundRenderer.ts` rasterizes image/text foregrounds into a transparent square canvas (`rasterizeForeground`) — text is ink-fitted via `measureText` — and that **same function feeds the live preview (`components/ForegroundCanvas.tsx`), the banner canvas and the export pipeline**, so all three match. Every effect (drop/cast shadow, score) only needs a `CanvasImageSource`, which is why non-icon kinds slot into the existing compositing unchanged. `ForegroundCanvas` deliberately holds no React state: it awaits the rasterizer under a cancellation flag (a late-loading font can never cause a re-render loop).

### Foreground transform, effects compositor, presets, undo

- **Transform**: `foregroundOffsetX/Y` (percent of the *visible* tile), `foregroundScale`, `foregroundRotation`, `foregroundFlipX/Y` in `iconConfig` apply to every kind. `utils/glyphEffects.ts` is the single compositor (`drawTransformedGlyph`, `drawGlyphWithEffect`, `drawCastShadow`) used by the export panel, the banner and the preview's cast shadow; `IconTile` applies the same math as a CSS transform via `foregroundCssTransform`. The `refSize` of a placement is the visible tile (72 dp safe zone for Android adaptive layers, `size` elsewhere) so percent offsets mean the same thing everywhere. The hero tile in `IconPreview` is draggable (pointer capture), double-click recenters, arrow keys nudge.
- **Cast shadow** is built by doubling offsets (log2(size) blits), not by stamping every pixel; the SVG exporter uses the same idea with an `feOffset` chain.
- **Outline** (sticker stroke) and **Offset print** (hard, shifted, tinted copy) are glyph-bound like the drop shadow. Their colours come from `getEffectPalette(config)` in `utils/iconEffects.ts` (outline = white or near-black, whichever separates best from both the glyph and the tile; offset = a tint of the background, deeper on light tiles and lighter on dark ones) and are passed to `drawGlyphWithEffect` as `options.palette`; sizes are `OUTLINE_WIDTH_RATIO` / `OFFSET_PRINT_RATIO` of `refSize`. Canvas outline is a 48-blit stamped dilation (`drawOutline`), SVG uses `feMorphology` dilate; the preview paints both on the same overlay canvas `IconTile` already uses for the cast shadow.
- **Foreground gradients on icons** are one `userSpaceOnUse` sweep across the icon's viewBox in all three pipelines (preview defs via `getIcon()` dimensions, export/banner via the rendered `viewBox`, SVG export via a nested `<defs>`). In the DOM preview the gradient is applied with a scoped `<style>` rule targeting `[stroke="currentColor"]` / `[fill="currentColor"]` elements — Iconify bodies carry those presentation attributes, which beat any `stroke` inherited from the root, so inline styles on the root never reached them. Every `IconTile` gets a `useId()`-based gradient id; do not derive ids from size/shape (tiles of equal size share the document and `url(#…)` resolves to the first match).
- **Standard preview has no overscan**: it represents the plain PNG export (full-tile background gradient, like iOS). Only the Android device preview models the 108/72 dp adaptive overscan.
- **Presets** (`utils/presets.ts`, `STYLE_PRESETS`/`applyPreset`/`shuffleStyle`) only touch look fields and keep the foreground + transform; the Customize tab renders each preset as a live `IconTile`.
- **Undo/redo** (`utils/useHistory.ts`) tracks a snapshot of `{generatedIcon, iconSource, iconStyle, iconConfig, bannerConfig}` in `App.tsx`; changes within 300 ms coalesce into one step, the first second after mount is ignored (library bootstrap), Ctrl/Cmd+Z and Ctrl+Shift+Z / Ctrl+Y are wired outside text fields.

### Fonts (Fontsource)

`utils/fontsourceApi.ts` wraps the keyless, CORS-enabled Fontsource API (`api.fontsource.org/v1/fonts`, ~2,100 fonts with SPDX license metadata). The catalog is fetched once per page (20 s abort; a failure clears the promise so a retry works) and mirrored into a tiny external store (`subscribeToCatalog` / `getCatalogSnapshot`, read with `useSyncExternalStore`); it lives in memory only — never in `localStorage`, which sessions with images need. `prefetchFontCatalog()` runs when the text panel mounts and when a picker trigger is hovered or focused, so the list is usually ready before it opens; until then the picker shows the curated `POPULAR_FONTS_FALLBACK` list with a loading footer (or an error + Retry). `utils/fontLoader.ts` loads faces by injecting a **static** jsDelivr stylesheet (`cdn.jsdelivr.net/fontsource/css/{id}@latest/{file}.css`; the variable CSS renames the family to `"<Family> Variable"`, so it is not used) and then `document.fonts.load(spec, sampleText)`. The regular face always uses `index.css` — the font's default face, which exists for every font, whereas `400.css` 404s for fonts without a regular weight (Sunflower, Buda, italic-only Molle); other faces fall back exact → upright same weight → `index`, and the browser synthesizes the rest. Stylesheet and face waits give up after 15 s (the browser still swaps the face in if it lands later). **Always pass the text you are about to draw** — Fontsource splits faces into `unicode-range` subsets, and without real sample text non-Latin glyphs never download. `components/FontPicker.tsx` is the shared picker used by the text foreground and the Store Banner: a Popover with its own search input and a `@tanstack/react-virtual` listbox (deliberately not cmdk — its mount-driven "select the first item" logic fights rows that mount and unmount while scrolling), keyboard navigation on the input (arrows, PageUp/Down, Enter), the selected font scrolled into view on open, and per-row preview faces loaded lazily behind a module-level status cache (rows stay dimmed until their face lands). `BannerConfig.font` stays the CSS family name (what `ctx.font` needs); `fontId` is backfilled for legacy sessions by `sessionStore.normalizeSession`.

### Icon identity & the Iconify migration

Every icon is a `prefix:name` Iconify id (e.g. `lucide:alarm-clock`). The whole app is source-agnostic — there are no per-icon-library code branches.

- **`utils/iconManager.tsx`** is the single icon abstraction. `getIconComponent(iconifyId)` returns a cached React adapter wrapping `@iconify/react`'s `<Icon>` that accepts the legacy prop contract (`size`, `color`, `strokeWidth`, `style`). Persisted icon URLs use the form `iconify:<prefix>:<name>`.
- **Legacy migration**: older saved sessions used `icon:<PascalName>:<source>` (lucide/phosphor/solar). `legacyToIconifyId` / `migrateLegacyIconUrl` convert these on read. When touching URL parsing, preserve both formats.
- **`utils/iconifyApi.ts`** wraps the public Iconify HTTP API (`api.iconify.design`) for metadata only — collection list, per-collection icon names, and cross-collection search. SVG fetching/caching is handled independently by `@iconify/react`. Responses are cached in module-level maps for the page lifetime.

### Style families & license filtering

- **`utils/iconifyCollections.ts`** — `STYLE_FAMILIES` registry maps families that ship as multiple prefixes sharing icon names (Phosphor `ph`/`ph-fill`/…, Solar, Material Symbols, Fluent, Heroicons) to a single user-facing "source" with a style selector. Collections outside this registry hide the style selector. Also carries per-family `license` metadata and `isBrandPack` (trademark warnings).
- **`utils/packFilterStore.ts`** — a tiny pub/sub store (consumed via `useSyncExternalStore`) gating which packs appear in the picker, keyed by SPDX license code. Uses a **blacklist** approach: missing keys default to enabled so new/uncontrolled licenses are never silently hidden. Brand/logo packs are the exception: `isBrandCollection` (`iconifyCollections.ts` — Iconify category `Logos`, or a brand/logo prefix/name, or a family's `isBrandPack`) hides them **by default** behind a separate `brand-packs-visible` flag that `PackSettingsDialog` toggles; a restored session can still show a brand icon, and the Foreground tab then shows the trademark warning.

### Export pipeline (the tricky part)

`components/DownloadPanel.tsx` rasterizes icons to PNG entirely client-side. Every generator calls one `renderForeground` dispatcher: image/text kinds go through `rasterizeForeground` (fast, no React mount), icons through `renderIconToCanvas`:

1. Mounts the Iconify React component into an off-screen `<div>` via a throwaway `createRoot`, after `loadIcon()` preloads the SVG data.
2. Reads the rendered `<svg>` from the DOM, applies colors/gradients/part-colors (or monochrome), then serializes with `XMLSerializer`. **`currentColor` is string-replaced** with the resolved color because it won't resolve in a standalone SVG `<img>`.
3. Loads the SVG blob into an `Image`, draws it onto a `<canvas>` (with rounded-rect clip, background fill, optional effect), and exports via `toDataURL`.

A **100ms `setTimeout`** after render gives Iconify time to inject the SVG before serialization — fragile but intentional. ZIPs are assembled with **JSZip** and include a generated `Contents.json` (iOS) / adaptive-icon XML (Android) plus an `ATTRIBUTION.md` from `utils/licenseManager.ts` (icon-pack section for icons, a "Font Used" section for text, a rights reminder for uploaded images). iOS exports use a fully opaque square canvas (Apple applies the rounded mask). The Android monochrome layer for image/text is a black silhouette through the alpha channel.

The iOS ZIP has two sets: `ios/AppIcon.appiconset/` (single 1024 px image, Xcode 14+; with the toggle on it also carries `AppIcon-Dark.png` and `AppIcon-Tinted.png` registered as `luminosity` appearances — glyph-only on transparent, tinted = grayscale, a very dark solid glyph swaps to the background color so it stays visible) and `ios/legacy-sizes/` (the 21 explicit sizes). The panel shows debounced light/dark/tinted previews.

**SVG export** (`utils/svgExport.ts`, `buildIconSvg`): background + clip, foreground as vector where possible (Iconify body via `getIcon`/`buildIcon`, inlined SVG uploads, `<image>` for rasters, `<text>` with the font's Latin subsets embedded as data-URI `@font-face`), the same transform math, `feDropShadow` / `feOffset`-chain cast shadow / score rect. `favicon.svg` adds a `prefers-color-scheme: dark` rule that darkens the background; it is included in the favicon package.

Supporting render utils: `utils/gradient.ts` (multi-stop gradients, angle→SVG/canvas coords), `utils/iconEffects.ts` (score alpha, effect palette) + effect drawing (drop-shadow, cast-shadow, score, outline, offset print), `utils/opticalScale.ts` (per-icon visual sizing).

### Config shape & sessions

The `iconConfig` object is the central design state; its shape and defaults live in **`utils/iconConfig.ts`** (`IconConfig`, `DEFAULT_ICON_CONFIG`, `normalizeIconConfig`) and every consumer types against it — do not re-declare the shape. It has both legacy two-color gradient fields (`backgroundGradientStart`/`End`) and newer multi-stop fields (`backgroundGradientStops`, `…Angle`) — multi-stop overrides the pair when present. **When restoring sessions, always merge over current defaults** (`{ ...prev, ...restored }`) so old sessions lacking new fields rehydrate correctly (see `handleRestoreSession`); `sessionStore.normalizeSession` additionally fills missing fields on read (foreground fields, banner `fontId`). `utils/sessionStore.ts` persists up to 20 sessions in `localStorage`, migrates legacy icon URLs on read, and throws `SessionStorageError` (`code: 'quota'`) when storage is full — sessions with uploaded images are large, so callers toast the message and keep the dialog open.

### UI components

`components/ui/` is the shadcn/ui + Radix primitive set (don't hand-edit unless changing a primitive's behavior app-wide). Feature components live directly under `components/`. Styling is Tailwind CSS 4 via `@tailwindcss/vite`; theming uses `next-themes` (`utils/useTheme.ts`, `ThemeToggle`).

Project-specific primitives added on top of shadcn, all in `components/ui/`:

- `angle-slider.tsx` (`AngleDial`) — compact rotary control built on `@ark-ui/react` AngleSlider. 0° is 12 o'clock, clockwise, so a value maps 1:1 to CSS gradient angles and CSS `rotate`. `arc="signed"` draws the ring the short way round so values past 180° read as negative (used for foreground rotation, which is stored as −180…180; the dial converts). Ark puts `aria-label` on the thumb (`role="slider"`), not the root.
- `slider-field.tsx` (`SliderField`) — one-line label · slider · editable number read-out; double-clicking the label restores `resetTo`. Use it instead of stacking a `Label` over a `Slider`.
- `color-field.tsx` (`ColorField`) — swatch (native picker) + hex text.

**Responsive layout**: `sm:` (640 px) is the phone/desktop split for paddings and stacked rows (transform sliders + rotation dial, effect select + opacity); the editor/preview columns stack below `lg`. Both grid columns need `min-w-0` — `truncate`d filenames in the download list otherwise widen the column past the viewport. On phones a floating live `IconTile` in `App.tsx` (hidden while the preview column intersects the viewport) jumps to the preview; the icon grid picks its column count from a `ResizeObserver` on the scroll container; `ZoomPanViewport` scales the phone frame to its container width and only sets `touch-action: none` while zoomed so the page still scrolls; popovers are capped at `calc(100vw-2rem)`; `globals.css` forces 16 px text fields on phones so iOS Safari does not zoom into them.

The Customize tab is an `Accordion type="multiple"` of `components/SettingsSection.tsx` blocks (Background, Foreground color, Shape, Position & size, Effect); each header carries a live summary (`SwatchChip` + text) so collapsed sections still show their state. `GradientStopsEditor` is shared with the Store Banner tab and embeds the `AngleDial` for the gradient angle.

## Attribution / Licensing note

Exported ZIPs always include attribution resolved from the Iconify API (cached after first fetch), falling back to the local `STYLE_FAMILIES` registry. Brand/logo packs (`isBrandPack`) carry separate trademark restrictions beyond the icon-pack license — the UI surfaces a warning for these.
