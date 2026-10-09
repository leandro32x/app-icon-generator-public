# App Icon Generator

A browser-based tool for designing app icons and exporting production-ready
assets for iOS and Android.

The app uses Iconify collections for icon search and rendering, lets you tune
colors, gradients, spacing, corner radius, and icon effects, then generates the
platform files you need for app stores and native projects.

## Features

- Browse Iconify icon packs, including all-collection search.
- Upload your own foreground image (PNG, JPEG, WebP or SVG) and optionally tint
  it with the foreground color or gradient.
- Use text as the foreground — a letter, monogram or short word — set in any
  of 2,100+ open-source fonts from the Fontsource catalog.
- Pick banner fonts from the same catalog, with license info shown per font.
- Switch styles for supported icon families such as Phosphor, Solar, Material
  Symbols, Fluent UI, and Heroicons.
- Filter icon packs by family and license preferences.
- Customize solid or multi-stop gradient backgrounds.
- Customize icon color, icon gradients, and per-part SVG colors.
- Adjust padding, corner radius, and effects such as drop shadow, cast shadow,
  and score overlay.
- Move, scale, rotate, and flip the foreground; drag it directly in the large
  preview, nudge it with the arrow keys, or double-click to recenter.
- Apply one-click style presets or shuffle a harmonious random style.
- Undo and redo every change (Ctrl+Z / Ctrl+Shift+Z).
- Export iOS 18 dark and tinted icon appearances alongside the light icon.
- Export a scalable `icon.svg` and a dark-mode-aware `favicon.svg`.
- Preview app icons across common iOS and Android sizes.
- Generate iOS icon ZIPs with `Contents.json`.
- Generate Android adaptive icon ZIPs with background, foreground, monochrome,
  legacy, and Play Store assets.
- Generate simple app banner artwork.
- Save and restore design sessions in the browser.
- Include icon-pack attribution in exported ZIP files.
- Toggle light and dark themes.

## Tech Stack

- React 19
- Vite 6
- TypeScript
- Tailwind CSS 4
- Radix UI primitives / shadcn-style components
- Iconify
- JSZip
- TanStack Virtual

## Getting Started

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

The production build is emitted to `build/`.

## Usage

1. Pick a foreground type: an Iconify icon, an uploaded image, or text.
2. For icons, choose a pack (or search all collections) and select an icon; for
   images, drop a file (transparent PNG/SVG works best); for text, type it and
   choose a font, weight and letter spacing.
3. Tune the background, icon color, gradients, padding, radius, and effects.
4. Use the preview panel to check how the icon reads at platform sizes.
5. Download individual assets or export full iOS / Android ZIP packages.
6. Save a session if you want to return to the design later.

## Exported Assets

### iOS

The iOS ZIP contains `AppIcon.appiconset/`, a single-size asset catalog for
Xcode 14 or newer with the light icon and, when enabled, the iOS 18 dark and
tinted appearances registered in its `Contents.json`, plus `legacy-sizes/`
with every explicit iPhone and iPad size. iOS exports use a fully opaque square
canvas, following Apple's expectation that the system applies the final rounded
mask; the dark and tinted variants are glyph-only on a transparent background,
as the system supplies their backdrop.

### Android

The Android ZIP includes:

- `play_store_512.png`
- adaptive icon XML
- background layers
- foreground layers
- monochrome layers
- legacy launcher icons for standard densities

## Attribution And Licenses

Every exported ZIP includes an `ATTRIBUTION.md` file for the selected icon. The
app resolves license metadata from Iconify when possible and falls back to the
local icon-family registry for bundled family shortcuts. Text foregrounds get a
"Font Used" section with the font's license (resolved from Fontsource); uploaded
images get a reminder that you must hold the rights to the artwork.

Brand and product logo packs may still have trademark restrictions that are
separate from the icon pack license. Verify brand usage rights before shipping
an app icon based on a logo.

## License

Released under the [MIT License](LICENSE).

Icons rendered and exported by this tool are provided by their respective icon
packs under their own licenses; each exported ZIP includes an `ATTRIBUTION.md`
with the relevant details. Brand and product logo packs may carry additional
trademark restrictions — see the note above.

## Acknowledgements

Built with [React](https://react.dev), [Vite](https://vite.dev), and
[Tailwind CSS](https://tailwindcss.com); UI components based on
[shadcn/ui](https://ui.shadcn.com) and [Radix UI](https://www.radix-ui.com);
icon search and rendering powered by [Iconify](https://iconify.design).

