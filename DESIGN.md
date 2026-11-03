# Design language

Inspired by the macOS Weather app's idea (the sky is the interface), with its own layout and details.

## Principles
- The sky gradient is the background and changes with condition and day/night (`src/theme.ts`). Everything else is quiet glass on top.
- Text is always white. Cards are dark-tinted glass so contrast holds on every sky.
- One accent per data type, used sparingly (temperature ramp, UV ramp, AQI ramp).
- Motion is subtle and cheap: 200-300 ms ease-out fades and a slow gradient crossfade when the sky changes. Nothing animates while idle. Respect `prefers-reduced-motion`.
- No images, no web fonts, no UI kit. Hand-written SVG and CSS only.

## Tokens (CSS variables on `:root`)
```
--font: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
--font-display: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif;
--text: #fff;
--text-2: rgba(255,255,255,.72);
--text-3: rgba(255,255,255,.5);
--glass: rgba(15,23,42,.24);
--glass-strong: rgba(15,23,42,.38);
--glass-border: rgba(255,255,255,.14);
--glass-blur: blur(18px) saturate(140%);
--radius-lg: 20px;  --radius-md: 14px;  --radius-sm: 10px;
--gap: 12px;  --pad: 16px;
--ease: cubic-bezier(.2,.7,.2,1);
```
Type scale: hero temperature 96px / weight 200 / display font / letter-spacing -2px; city 28px / 600; condition 18px / 500; card title 11px / 600 / uppercase / letter-spacing .08em / `--text-3`; card value 32px / 300 display; body 14px; small 12px.

## Layout (window default 1000x720, min 760x560)
- Left sidebar 232px: saved cities (name, local time, temp, mini condition icon), search box on top, collapses to hidden under 900px width (toggle button).
- Main column scrolls. Order top to bottom:
  1. Hero: left-aligned. City, huge temperature, condition, "H 13  L 7", and a one-line summary ("Feels like 8. Rain expected around 15:00.").
  2. Hourly card: 24 columns of (hour label, icon, temp), with a smooth temperature sparkline (SVG path) behind. Horizontal scroll. "Now" column highlighted.
  3. Bento grid (CSS grid, auto-fit, min 220px): 10-day card spans 2 columns and 2 rows; then Air quality, UV, Sun (sunrise/sunset arc), Wind (compass), Precipitation, Feels like, Humidity, Visibility, Pressure.
- 10-day rows: day name, icon, rain chance (only if >=20%), min, range bar, max. The range bar sits on a shared scale across all 10 days, with the gradient filled according to temperature (cold blue to warm orange).

## Color ramps
- Temperature bar: <=0 #7cc4ff, 10 #6ee7b7, 20 #fde047, 30+ #fb923c (interpolate).
- UV: 0-2 #4ade80, 3-5 #facc15, 6-7 #fb923c, 8-10 #ef4444, 11+ #a855f7.
- AQI (US): 0-50 #4ade80, 51-100 #facc15, 101-150 #fb923c, 151-200 #ef4444, 201+ #a855f7.

## Units
Settings: temperature C/F, wind km/h | mph | m/s, 12/24h clock. Defaults: C, km/h, 24h. Stored in localStorage. Backend data is always metric; convert only in `format.ts`.
