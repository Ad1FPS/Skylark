# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-11-10

### Fixed

- Saved cities in the sidebar kept showing the weather from when the app started. Rows now refresh every 15 minutes while the window is open, right after reopening it from the tray, and the selected city always matches the main view.

## [0.1.1] - 2026-11-09

### Fixed

- Coloured bars and markers were missing in the installed app (10-day temperature ranges, air quality and UV scales, humidity and other tile indicators), because the content security policy blocked inline styles.

## [0.1.0] - 2026-11-09

### Added

- Current conditions, an hourly strip that switches between conditions, chance of rain and wind, a 10-day forecast and a 15-minute rain nowcast.
- A precipitation radar with a 60-minute nowcast, pan, zoom and playback, plus an expanded view that gives the map half the window.
- A wind map with animated streamlines for the next 24 hours, coloured by speed.
- Tiles for air quality, UV, sun, wind, moon phase, averages against the 10-year normal, precipitation, feels like, humidity, visibility and pressure, each with a detail popover; 10-day rows and the hourly card open a Conditions popover for that day.
- An animated sky that follows the time of day and weather: sun with a halo, moon, stars, clouds, rain running down the glass, snow, fog and lightning, with an optional 60 fps mode.
- Weather icons as line drawings or in colour.
- Official weather alerts for the United States, Canada, Germany and 38 other European countries, with a coloured pill, the full text and instructions in a popover, a warning mark on the city in the sidebar and optional system notifications.
- Saved cities with search, each showing its local time and its own small animated sky, and "Use my location" based on your IP address.
- Settings and About in one window opened from the gear in the title bar (or Ctrl+,), covering units, icons, frame rate, window behaviour, start with Windows, alert notifications, updates and data-source credits.
- Temperature in Celsius or Fahrenheit, wind in km/h, mph or m/s, and a 12- or 24-hour clock.
- Tray support: closing the window keeps the app in the tray; the tray icon or a second launch brings it back, and the current city refreshes in the background. "Keep ready when closed" keeps the window ready for an instant reopen.
- Start with Windows, launching into the tray.
- Window size, position and maximised state are remembered between runs, with a minimum window size so the layout stays readable.
- Automatic updates: a daily check of GitHub Releases, an update bar that asks before installing, and "Check for updates" in Settings > About.
- Data-source credits and licence links in About.

[0.1.2]: https://github.com/Ad1FPS/Skylark/releases/tag/v0.1.2
[0.1.1]: https://github.com/Ad1FPS/Skylark/releases/tag/v0.1.1
[0.1.0]: https://github.com/Ad1FPS/Skylark/releases/tag/v0.1.0
