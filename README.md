# Skylark

A lightweight weather app for Windows, inspired by the macOS Weather app. Lightweight first, modern UI second.

Built with Tauri 2 (WebView2), a Rust backend and a vanilla TypeScript + plain CSS frontend (Vite). No UI framework.

![Clear day](screenshots/clear-day.jpg)

![Rain at night](screenshots/rain-night.jpg)

| Clear night | Snow | Thunderstorm |
|---|---|---|
| ![Clear night](screenshots/clear-night.jpg) | ![Snow](screenshots/snow-day.jpg) | ![Thunderstorm](screenshots/storm-night.jpg) |

| Day popover | Expanded radar |
|---|---|
| ![Day popover](screenshots/popover-day.jpg) | ![Expanded radar](screenshots/radar-expanded.jpg) |

## Features

- Current conditions, hourly strip (switch between conditions, chance of rain and wind), 10-day forecast, 15-minute rain nowcast
- Precipitation radar with a 60 minute nowcast, a source picker (LibreWXR with RainViewer as fallback), pan, zoom and play, and an expanded view that gives the map half the window
- Tiles for air quality, UV, sun, wind, moon phase, averages (today's high versus the 10-year normal), precipitation, feels like, humidity, visibility and pressure; each opens a popover next to it, and the 10-day rows and hourly card open a per-day Conditions popover
- Animated sky that follows the time of day: sun with a faint halo, moon, stars, clouds, rain (with droplets running down the tiles), snow, fog, lightning; optional 60 fps mode
- Weather icons as line drawings or in colour
- Saved cities with live local time and their own sky, search, and "Use my location" (IP based)
- Units: C/F, km/h, mph, m/s, 12/24 h; optional start with Windows (launches into the tray)
- Tray-resident: closing the window frees the webview (about 6 MB); the tray icon or a second launch brings it back, and the current location refreshes every 15 minutes in the background

The release exe is about 5 MB; the installer is about 1.6 MB.

## Build

Requirements: Node.js, Rust (stable), and the [Tauri 2 prerequisites for Windows](https://tauri.app/start/prerequisites/) (WebView2 is preinstalled on Windows 11).

```bash
npm install
npm run tauri dev                      # run in development
npm run tauri build                    # installer in src-tauri/target/release/bundle
npm run tauri build -- --no-bundle     # just the exe
```

Rust checks: `cd src-tauri && cargo test && cargo clippy -- -D warnings`. Frontend: `npx tsc --noEmit`.

## Data sources

- Weather, nowcast, air quality and geocoding: [Open-Meteo](https://open-meteo.com/) (CC BY 4.0; the free API is for non-commercial use)
- Radar: [LibreWXR](https://github.com/JoshuaKimsey/LibreWXR) (CC BY 4.0; national radar composites plus a 60 minute nowcast), with [RainViewer](https://www.rainviewer.com/) as fallback
- Map tiles: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- IP location: [ipwho.is](https://ipwho.is/)

## License

[MIT](LICENSE)
