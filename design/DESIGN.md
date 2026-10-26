---
name: Technical Kinetic Protocol
colors:
  surface: '#f5fbef'
  surface-dim: '#d6dcd0'
  surface-bright: '#f5fbef'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f6e9'
  surface-container: '#eaf0e4'
  surface-container-high: '#e4eade'
  surface-container-highest: '#dee4d9'
  on-surface: '#171d16'
  on-surface-variant: '#444748'
  inverse-surface: '#2c322a'
  inverse-on-surface: '#edf3e7'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#141515'
  on-primary: '#ffffff'
  primary-container: '#292929'
  on-primary-container: '#919090'
  inverse-primary: '#c8c6c5'
  secondary: '#5b6059'
  on-secondary: '#ffffff'
  secondary-container: '#e0e4db'
  on-secondary-container: '#61665e'
  tertiary: '#151513'
  on-tertiary: '#ffffff'
  tertiary-container: '#2a2927'
  on-tertiary-container: '#92908d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e4e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1b1c1c'
  on-primary-fixed-variant: '#474746'
  secondary-fixed: '#e0e4db'
  secondary-fixed-dim: '#c4c8bf'
  on-secondary-fixed: '#191d17'
  on-secondary-fixed-variant: '#444841'
  tertiary-fixed: '#e6e2de'
  tertiary-fixed-dim: '#c9c6c3'
  on-tertiary-fixed: '#1c1b1a'
  on-tertiary-fixed-variant: '#484644'
  background: '#f5fbef'
  on-background: '#171d16'
  surface-variant: '#dee4d9'
typography:
  display-numeric:
    fontFamily: Space Mono
    fontSize: 48px
    fontWeight: '400'
    lineHeight: 52px
    letterSpacing: -0.04em
  display-numeric-mobile:
    fontFamily: Space Mono
    fontSize: 36px
    fontWeight: '400'
    lineHeight: 40px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Space Mono
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Mono
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 26px
    letterSpacing: -0.01em
  metric-value:
    fontFamily: Space Mono
    fontSize: 24px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: -0.02em
  body-regular:
    fontFamily: Space Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  body-bold:
    fontFamily: Space Mono
    fontSize: 13px
    fontWeight: '700'
    lineHeight: 18px
    letterSpacing: 0em
  label-caps:
    fontFamily: Space Mono
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.12em
  label-caps-muted:
    fontFamily: Space Mono
    fontSize: 9px
    fontWeight: '400'
    lineHeight: 11px
    letterSpacing: 0.14em
  caption:
    fontFamily: Space Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 0.75rem
  margin: 1rem
  space-2xs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
---

## Brand & Style

This design system establishes a high-precision, technical instrumentation interface tailored for disciplined athletic tracking. Rejecting gamified tropes, bright neon accents, and heavy decorative visual clutter, the interface draws aesthetic rigor directly from industrial hardware readouts, architectural telemetry, and Swiss typographic rationalism. 

The mood is analytical, quiet, and uncompromisingly utilitarian. The interface operates as an electronic paper ledger: calm, tactile in its clarity, and free of emotional distortion. It treats sets, repetitions, intervals, and resistance not as abstract achievements, but as structural data metrics calibrated for performance.

Key visual attributes:
- Monochromatic discipline on a natural light sage paper surface.
- Unwavering reliance on pure 1px architectural lines over drop shadows or blur planes.
- Micro-tracked technical labels directly stacked over large tabular metrics.
- Minimalist technical diagrams (mechanical line-art, wireframe equipment schematics, and vector load distributions) executed exclusively in 1px stroke weights.

## Colors

The palette is strictly constrained to a four-value tonal continuum inspired by technical hardware monitors and archival drafting stock:

- **Surface Base (`#EBF1E5`)**: A soft, desaturated pale sage paper tint serving as the global canvas background and default card fill.
- **Primary Ink (`#292929`)**: A dense, near-black carbon used for high-emphasis typography, primary state outlines, filled active indicators, and technical line art.
- **Secondary Muted Text (`#959991`)**: A neutralized middle value used for inactive states, metadata labels, units of measure, and non-selected options.
- **Hairline & Grid Line (`#B0B8B0`)**: A delicate mid-tone green-gray calibrated for tabular horizontal dividers, structural cell boundaries, and subtle separation marks.

No gradients, blurs, tinted accent colors, or dark mode overrides exist within this system. Inversion is strictly binary: when an element (such as an active pill or primary tag) activates, it fills with `#292929` and renders foreground copy in the light surface color (`#EBF1E5`).

## Typography

The typographical framework is anchored by `Space Mono`, delivering an engineered, fixed-pitch grotesk aesthetic akin to electronic measurement panels. Numbers must render in tabular lining figures (`font-variant-numeric: tabular-nums`) to ensure vertical column alignment across rapidly updating metrics, sets, and rep timers.

Typographic hierarchy relies on extreme contrast between size and tracking:
- **Metrics & Telemetry**: Rendered light and large (`metric-value` and `display-numeric`), followed directly by small, lowercase or capitalized measurement symbols (`kg`, `reps`, `s`, `bar`).
- **Data Labels**: Positioned above or beside readouts in uppercase micro-type (`label-caps`), heavily letter-spaced to ensure legibility on mobile hardware.
- **Weights**: Restrained to regular (`400`) and bold (`700`). Regular is used for active numeric data and running copy; bold is used for column headers, active rows, and primary mode labels.

## Layout & Spacing

The layout model is dense, systematic, and modular, optimized for immediate one-handed review during workout sessions.

- **Structure**: Uses a 4-column mobile fluid layout with a compact outer margin of `1rem` (16px) and an inner gutter of `0.75rem` (12px).
- **Rhythm**: Spacing tokens are derived from a strict 4px base increment. Vertical stacking relies on tight internal paddings (`space-sm` and `space-md`) within cards to preserve data density while maintaining clear demarcations.
- **Card Framing**: Information is grouped into independent modular tiles spanning either half the grid (2 columns) or the full width (4 columns). Multi-column tables utilize full-width rows bound by continuous hairlines.

## Elevation & Depth

This system is strictly flat: no drop shadows, no box-shadow blurs, and no elevation z-layers.

Depth is communicated entirely through 2D graphic enclosure:
- **Structural Boundaries**: Enclosed using explicit 1px solid borders in `#292929`.
- **Secondary Divisions**: Rendered using 1px solid horizontal hairlines in `#B0B8B0`.
- **Surface Elevation**: All cards, badges, and sheets share the identical canvas background color `#EBF1E5`. Stacking order is communicated strictly through border grouping and perimeter nesting.

## Shapes

The geometric personality balances industrial precision with organic pocket-device comfort:
- **Cards & Data Modules**: Defined by a distinct `1rem` (16px, `rounded-2xl`) corner radius, paired with a solid 1px `#292929` stroke.
- **Pills, Sliders & Badges**: Fully radiused at 9999px (stadium curves).
- **Interactive Check Toggles & Micro Elements**: Finished with full stadium curvature or matched 4px micro-radii.

## Components

### Cards & Telemetry Containers
- **Visual Style**: Background is `#EBF1E5`, outlined with a crisp 1px solid `#292929` border, and shaped with a `16px` (`rounded-2xl`) border-radius.
- **Internal Layout**: Top-left contains uppercase micro-labels (`label-caps-muted`); top-right contains secondary status badges or units. Metric values sit bold and tabular.

### Pill Toggles (State Switches)
- **Active State (`ON`)**: 
  - Background: Solid `#292929`.
  - Border: 1px solid `#292929`.
  - Content: Crisp typography in `#EBF1E5` displaying `ON` on the leading side, paired with a sliding circle knob in `#EBF1E5`.
- **Inactive State (`OFF`)**:
  - Background: Transparent / `#EBF1E5`.
  - Border: 1px solid `#292929`.
  - Content: Muted typography in `#959991` displaying `OFF`, paired with an ink circle knob in `#292929`.

### Data Tables & Log Lists
- Rows are delineated using 1px hairline horizontal dividers (`#B0B8B0`).
- Columns align cleanly along monospaced channels: Exercise Name, Weight, Repetitions, Interval, and Set Toggle.
- Active or currently edited rows shift to bold text weight (`#292929`); inactive or queued rows remain in secondary muted ink (`#959991`).

### Buttons & Quick Actions
- **Primary Action (e.g., "+ ADD", "START SET")**: Minimal, un-filled button styling with a bold 1px `#292929` hairline border or pure monospaced anchor text preceded by a `+` symbol.
- **Steppers & Incrementors**: Circular 1px `#292929` outline buttons housing centered `+` and `−` symbols in 12px Space Mono, placed horizontally beside primary metric values.

### Technical Line Art & Muscle / Equipment Diagrams
- Pure 1px vector wireframes rendered exclusively in `#292929`. No fills, half-tones, or gradient meshes. Diagrams resemble architectural circuit prints or coil schematics (e.g., serpentine cable paths, bar load racks, target muscle highlight lines).