# DayZero Style Guide

> Reference document for maintaining visual and tonal consistency across all DayZero interfaces.
> All design tokens are defined as CSS custom properties in `src/index.css` and are fully swappable.

---

## 1. Brand Identity

**Name**: DayZero (one word, capital D and Z)

**Positioning**: Your idea, under real scrutiny. DayZero is not a pitch coach or cheerleader. It is a pressure test that simulates what happens when experienced investors interrogate your startup idea.

**Personality**: Direct, rigorous, honest. Respects the founder's time by skipping platitudes.

---

## 2. Color Palette

All colors are defined as CSS custom properties on `.dark` in `src/index.css`. Change them in one place, every component updates.

### Core Palette

| Token                   | Hex         | Usage                                     |
|-------------------------|-------------|-------------------------------------------|
| `--background`          | `#050505`   | Page background                           |
| `--foreground`          | `#f0f0f0`   | Primary text, headings                    |
| `--card`                | `#0c0c0c`   | Card / section backgrounds                |
| `--card-foreground`     | `#e8e8e8`   | Text on cards                             |
| `--primary`             | `#C8FF00`   | Primary accent (chartreuse) -- CTAs, links|
| `--primary-foreground`  | `#0a0a0a`   | Text on primary accent backgrounds        |
| `--secondary`           | `#141414`   | Secondary surfaces                        |
| `--secondary-foreground`| `#a0a0a0`   | Body text, descriptions                   |
| `--muted`               | `#1a1a1a`   | Muted backgrounds                         |
| `--muted-foreground`    | `#5a5a5a`   | Captions, labels, disabled text           |
| `--border`              | `#1e1e1e`   | Default borders                           |
| `--destructive`         | `#ef4444`   | Errors, destructive actions               |
| `--ring`                | `#C8FF00`   | Focus ring color                          |

### Custom DayZero Tokens

| Token                   | Value                        | Usage                          |
|-------------------------|------------------------------|--------------------------------|
| `--dz-forest`           | `#0A1F12`                    | Deep forest green containers   |
| `--dz-forest-mid`       | `#1A3D28`                    | Mid forest green               |
| `--dz-sage`             | `#3D5A4A`                    | Muted green, tertiary          |
| `--dz-chartreuse`       | `#C8FF00`                    | Primary accent                 |
| `--dz-chartreuse-hover` | `#D4FF33`                    | Hover state for accent         |
| `--dz-chartreuse-muted` | `rgba(200, 255, 0, 0.10)`   | Subtle accent backgrounds      |
| `--dz-chartreuse-glow`  | `rgba(200, 255, 0, 0.06)`   | Glow / shadow effects          |
| `--dz-surface`          | `#0c0c0c`                    | Surface background             |
| `--dz-surface-elevated` | `#161616`                    | Elevated surface (hover, modal)|
| `--dz-text-primary`     | `#f0f0f0`                    | Primary text                   |
| `--dz-text-secondary`   | `#a0a0a0`                    | Secondary text                 |
| `--dz-text-muted`       | `#5a5a5a`                    | Muted text                     |

### Tailwind Utility Classes

All custom tokens are mapped in `@theme inline` so they can be used as Tailwind classes:

```
bg-forest, bg-forest-mid, bg-sage
text-chartreuse, bg-chartreuse, bg-chartreuse-hover, bg-chartreuse-muted
bg-surface, bg-surface-elevated
```

---

## 3. Typography

### Font Families

| Role     | Font                | Weight Range | CSS Variable       | Tailwind Class    |
|----------|---------------------|-------------|---------------------|-------------------|
| Heading  | Outfit              | 500 -- 700  | `--font-heading`    | `font-heading`    |
| Body     | Inter               | 400 -- 500  | `--font-sans`       | `font-sans`       |
| Mono     | Fira Code           | 400 -- 600  | `--font-mono`       | `font-mono`       |

### Usage Rules

- **Headings** (`h1`--`h6`): Always use Space Grotesk. Applied automatically via the base layer CSS.
- **Body text**: Inter is the default sans-serif. No extra class needed.
- **Data, scores, labels, code**: Use `font-mono` class for Fira Code.
- **Never mix** heading font into body text or vice versa within the same block.

### Type Scale

Use Tailwind's default scale. Key sizes for reference:

| Class       | Size   | Usage                        |
|-------------|--------|------------------------------|
| `text-xs`   | 12px   | Captions, legal text         |
| `text-sm`   | 14px   | Labels, secondary text       |
| `text-base` | 16px   | Body text                    |
| `text-lg`   | 18px   | Large body text              |
| `text-xl`   | 20px   | Section subheadings          |
| `text-2xl`  | 24px   | Section headings             |
| `text-3xl`  | 30px   | Page subheadings             |
| `text-4xl`  | 36px   | Hero heading (mobile)        |
| `text-5xl`  | 48px   | Hero heading (tablet)        |
| `text-6xl`  | 60px   | Hero heading (desktop)       |
| `text-7xl`  | 72px   | Hero heading (wide)          |

### Letter Spacing

- Headings: `tracking-tight` (-0.025em)
- Body: default (0)
- Mono labels: `tracking-wide` (0.025em)

---

## 4. Spacing & Layout

- Use Tailwind's spacing scale (4px increments: `p-1` = 4px, `p-4` = 16px, `p-6` = 24px, etc.)
- **Max content width**: `max-w-6xl` (72rem / 1152px) for section content
- **Page padding**: `px-6` on all sections
- **Section vertical rhythm**: `py-24 sm:py-32` between sections

---

## 5. Effects & Textures

### Grain / Noise Overlay

Applied globally via the `<GrainOverlay />` component. Uses an SVG noise filter at 3.5% opacity over the entire viewport.

- Class: `grain-overlay` (applied automatically)
- z-index: 9998 (above content, below modals)
- `pointer-events: none` -- does not block interaction

### Glow

Two utility classes for chartreuse glow effects:

| Class                | Effect                              |
|----------------------|-------------------------------------|
| `glow-chartreuse`    | Large diffuse glow (80px + 160px)   |
| `glow-chartreuse-sm` | Smaller glow (40px)                 |

Use on CTAs, active cards, or hero elements. Do not overuse -- reserved for primary interactive elements and key visual anchors.

### Ethereal Light

Class `ethereal-light` creates a radial gradient with a faint chartreuse center. Used behind hero sections for depth.

---

## 6. Components

### Source of Truth

- **shadcn/ui** components live in `src/components/ui/`. These are the base primitives (Button, Input, Card, Dialog, etc.).
- **Custom components** in `src/components/shared/` (Logo, Nav, GrainOverlay) and `src/components/landing/` (Hero, Features, etc.).
- **react-bits** components in `src/components/` (ColorBends).

### Button Variants

shadcn/ui Button component supports these variants:

| Variant       | Usage                                  |
|---------------|----------------------------------------|
| `default`     | Primary action (chartreuse bg)         |
| `secondary`   | Secondary action (dark surface bg)     |
| `outline`     | Bordered, transparent bg               |
| `ghost`       | No border, no bg, hover reveals bg     |
| `destructive` | Danger actions (red)                   |
| `link`        | Text link style                        |

For the main CTA, use a custom styled `<a>` or `<button>` with:
```
bg-chartreuse text-background font-semibold glow-chartreuse-sm hover:bg-chartreuse-hover hover:glow-chartreuse
```

### Cards

- Background: `bg-card` or `bg-surface`
- Border: `border border-border`
- Hover: `hover:border-chartreuse/20 hover:bg-surface-elevated`
- Rounded: `rounded-xl`
- Padding: `p-6`

---

## 7. Icons

### Library

Lucide React -- the only icon library used. Installed as a dependency of shadcn/ui.

```tsx
import { Mic, FileText, Search, Users } from "lucide-react";
```

### Rules

- **No emoji**. Ever. Not in UI, not in copy, not in alt text.
- Use icons only where they aid comprehension (feature lists, navigation, status indicators).
- Do not use decorative icons.
- Default `strokeWidth={1.5}` for a refined look.
- Sizes: `size-4` (16px) inline, `size-5` (20px) in feature cards, `size-6`+ (24px) for hero/large elements.

---

## 8. Copy Guidelines

### Tone

- **Direct**: Say what it does. Not what it "empowers" or "enables."
- **Honest**: If something has limits, say so.
- **Specific**: Numbers, actions, outcomes. Not adjectives.
- **Conversational**: Write like you're talking to a smart founder over coffee. Not like a press release.

### Banned Words

Do not use these in any user-facing copy:

| Word/Phrase         | Why                              | Use Instead                |
|---------------------|----------------------------------|----------------------------|
| Revolutionary       | Unearned superlative             | (describe the specific change) |
| Game-changing       | Same                             | (describe the impact)      |
| Leverage            | Corporate jargon                 | Use                        |
| Synergy             | Meaningless                      | (describe the collaboration) |
| Cutting-edge        | Vague                            | (describe what's new)      |
| Disrupt             | Overused to the point of parody  | Replace, change, challenge |
| Unlock              | Implies magic                    | Enable, allow, give access |
| Seamless            | Almost never true                | (describe the integration) |
| Next-generation     | Undefined                        | (describe the improvement) |
| Best-in-class       | Unsubstantiated claim            | (show evidence)            |
| Empower             | Vague and patronizing            | Help, let, give            |

### Good Examples

- "Pressure-test your startup idea before you build it"
- "A simulated VC panel that asks the hard questions"
- "Not encouragement."
- "Every claim sourced and scored"
- "Three distinct VC personas debate your idea"

### Bad Examples

- "Revolutionize your pitch with AI-powered synergies"
- "Unlock your startup's potential with cutting-edge technology"
- "The next-generation platform for disruptive founders"

---

## 9. Backgrounds

### ColorBends (Hero)

The hero section uses the `<ColorBends />` component from react-bits with a Three.js WebGL shader.

Current configuration:
```tsx
<ColorBends
  colors={["#C8FF00", "#0A1F12", "#1A3D28"]}
  rotation={0}
  speed={0.15}
  scale={1.2}
  frequency={0.8}
  warpStrength={0.6}
  mouseInfluence={0.5}
  parallax={0.3}
  noise={0.05}
  transparent={false}
/>
```

The background is layered under a `bg-background/60` overlay for text readability, then an `ethereal-light` layer for depth.

---

## 10. File Organization

```
src/
├── index.css                    # All design tokens + global styles
├── App.tsx                      # Router
├── main.tsx                     # Entry point
├── lib/
│   └── utils.ts                 # cn() helper
├── components/
│   ├── ui/                      # shadcn/ui primitives
│   ├── ColorBends.tsx           # react-bits background
│   ├── shared/                  # Reusable across all pages
│   │   ├── logo.tsx
│   │   ├── nav.tsx
│   │   └── grain-overlay.tsx
│   └── landing/                 # Landing page specific
│       ├── hero.tsx
│       ├── video-demo.tsx
│       ├── features.tsx
│       └── footer.tsx
├── pages/
│   └── landing.tsx
└── hooks/                       # Custom hooks (future)
```

---

## 11. Do's and Don'ts

### Do

- Use the CSS custom properties for all colors. Never hardcode hex in components.
- Use `font-heading` for headings, default `font-sans` for body, `font-mono` for data.
- Keep the grain overlay active on all pages.
- Use Lucide icons at `strokeWidth={1.5}`.
- Favor whitespace and restraint over decoration.
- Use the `glow-chartreuse` effect sparingly -- one or two elements per viewport.
- Write copy that could be said out loud without sounding absurd.

### Don't

- Use emoji anywhere in the interface.
- Use more than two accent colors in any single view.
- Add decorative elements that don't serve comprehension.
- Use light mode as the default (we are dark-mode-first).
- Write in ALL CAPS for emphasis (use font weight or color instead).
- Add gradients that compete with the grain texture.
- Use stock photography.

---

## 12. Changing the Theme

To rebrand or adjust the visual identity:

1. **Colors**: Edit the `.dark` block in `src/index.css`. All tokens propagate automatically.
2. **Fonts**: Replace the `@import` statements at the top of `index.css` and update `--font-heading`, `--font-sans`, `--font-mono` in the `@theme inline` block.
3. **Grain intensity**: Change the `opacity` value in the `.grain-overlay::before` rule.
4. **Glow intensity**: Adjust `--dz-chartreuse-glow` alpha value.
5. **Border radius**: Change `--radius` to scale all rounded corners globally.
6. **ColorBends**: Adjust `colors`, `speed`, `frequency`, etc. props on the `<ColorBends />` component.

Everything is token-based. No magic numbers buried in components.
