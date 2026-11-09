# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/) (application pending; releases up to and including 0.1.1 are unsigned).

## Team roles

- Committers and reviewers: [Ad1FPS](https://github.com/Ad1FPS)
- Approvers: [Ad1FPS](https://github.com/Ad1FPS)

Only release builds produced from this repository by its GitHub Actions workflow are submitted for signing, and each signing request is approved manually by an approver.

## Privacy policy

Skylark does not collect telemetry, analytics or personal data, and has no account system. To show the weather it sends requests directly from your computer to these services:

- Open-Meteo: forecast, nowcast, air quality, climate averages and city search (coordinates of the cities you view, search text)
- LibreWXR: radar map tiles (map area being viewed)
- OpenStreetMap: map tiles (map area being viewed); Nominatim: one region lookup per saved city (its coordinates)
- MeteoAlarm, National Weather Service, Environment and Climate Change Canada, Bright Sky (DWD): weather alerts (the country and coordinates of the city shown)
- ipwho.is: only when you press "Use my location" (your IP address is visible to the service)
- GitHub: a daily check for a newer version of Skylark

Saved cities and settings are stored only on your computer. Each service's own privacy policy applies to the requests it receives.
