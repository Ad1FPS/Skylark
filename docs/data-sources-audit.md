# Data-source audit

Research date: 9 November 2026. Scope: the seven external data sources used by Skylark, checked against their published terms, limits, attribution rules and reliability for a free, MIT-licensed Windows app distributed publicly on GitHub. No code was changed for this audit.

The app is free, has no ads, subscriptions or payments, and is not sold. That matters for Open-Meteo, whose free tier is non-commercial only. Donations are not part of the app today; Open-Meteo explicitly permits voluntary donations.

## How the app makes requests

- Rust requests go through one shared `reqwest::Client` with `User-Agent: skylark/0.1` (`src-tauri/src/commands.rs:31-39`) and a 10-second timeout. Only NWS overrides the User-Agent.
- Radar metadata and radar tiles are fetched from the WebView (`src/radar/providers.ts`). No custom headers are set, so the User-Agent is the WebView2 default (a browser-like `Mozilla/5.0 ... Edg/...` string) and the Referer is the internal Tauri origin (`tauri.localhost`), not a public URL.
- OpenStreetMap base tiles are also loaded from the WebView as `<img>` elements (`src/ui/radar.ts:51-53`, `src/ui/windmap.ts:306`). No custom User-Agent or Referer is configured in `src-tauri/tauri.conf.json`.

---

## 1. Open-Meteo

### How the app calls it

All from Rust, no API key, shared `skylark/0.1` User-Agent:

| Use | Endpoint and request | Code |
|---|---|---|
| Forecast + 15-minute nowcast | `GET https://api.open-meteo.com/v1/forecast` with `current` (12 fields), `hourly` (15 fields), `daily` (15 fields), `minutely_15=precipitation`, `forecast_minutely_15=32`, `forecast_days=10`, `timezone=auto` | `src-tauri/src/weather.rs:681-724` |
| Air quality | `GET https://air-quality-api.open-meteo.com/v1/air-quality` with `current` and `hourly` for `us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide`, `forecast_days=3` | `src-tauri/src/weather.rs:700-721` |
| Geocoding | `GET https://geocoding-api.open-meteo.com/v1/search?name=...&count=8&language=en` | `src-tauri/src/weather.rs:726-734` |
| Historical archive (Averages tile) | `GET https://archive-api.open-meteo.com/v1/archive` with 10 years of `daily=temperature_2m_max`, `timezone=auto`; cached on disk for 90 days for each ~0.01° location | `src-tauri/src/climate.rs:9,65-83,102-125` |
| Wind map grid | `GET https://api.open-meteo.com/v1/forecast` with comma-separated latitude/longitude lists (up to 64 points), `hourly=wind_speed_10m,wind_direction_10m`, `forecast_hours=25`, `timezone=GMT` | `src-tauri/src/wind.rs:38-76` |

The weather bundle is cached for 10 minutes (`src-tauri/src/commands.rs:10`), so a normal open/refresh is two requests (forecast + air) plus one wind request when the map is shown. Geocoding runs only on a search; the archive request is rare and cached for 90 days.

### Terms

Open-Meteo's free tier is for non-commercial use only:

> "You may only use the free API services for non-commercial purposes." — <https://open-meteo.com/en/terms>

The terms define non-commercial to include "Private or non-profit websites or apps that do not have subscriptions or advertising" and explicitly allow voluntary donations. Skylark fits that definition today. If the project ever adds ads, paid features or a commercial product, it would need a paid Open-Meteo plan.

Data is CC BY 4.0; the licence says: "You must give appropriate credit, provide a link to the licence, and indicate if changes were made." The licence page gives the exact desired form:

> "Weather data by Open-Meteo.com" — <https://open-meteo.com/en/licence>

### Limits

- Free tier: less than 10,000 API calls/day, 5,000/hour and 600/minute. The pricing table also lists 300,000 calls/month.
- Limits are applied by IP address and application; Open-Meteo may block apps or IPs that misuse the service without notice.
- A normal Skylark user is far below these limits. Even with two forecast requests per 10-minute refresh, a continuously open app is roughly 288 requests/day, plus occasional geocoding, wind and archive calls. Multi-location wind requests carry up to 64 locations in one HTTP call; a user opening the wind map repeatedly still stays well inside the limits.

### Attribution currently shown

- README line 53: "Weather, nowcast, air quality and geocoding: Open-Meteo (CC BY 4.0; the free API is for non-commercial use)" with a link to open-meteo.com.
- In the app, only the wind map says "Wind: Open-Meteo" (`src/ui/windmap.ts:264`), as plain text with no link. Forecast, air-quality, geocoding and archive data carry no in-app credit.

CC BY 4.0 requires a link next to the data; a README credit alone is not enough, and the licence asks for a link "next to any location Open-Meteo data are displayed". This is the main gap. The app also derives weather codes and wind streamlines, and CC BY 4.0 asks you to indicate that changes were made, so the credit should say that some values are processed/derived.

### Reliability

Open-Meteo is a commercial-grade open-data service with a public status page (<https://status.open-meteo.com>), but the free tier has no SLA and the terms disclaim uninterrupted provision. In practice it is widely used and reliable; a failed air-quality call is already non-fatal (`air = None`), which is the right degradation.

### Verdict: CHANGE

Add a visible in-app credit and link, for example in an About/Settings panel or a small footer on the forecast card:

`Weather data by <a href="https://open-meteo.com/">Open-Meteo.com</a> (CC BY 4.0)`

Also link the CC BY 4.0 licence. Keep the existing README credit. No API or rate-limit change is needed while the app remains non-commercial.

---

## 2. LibreWXR public instance (`api.librewxr.net`)

### How the app calls it

- Primary radar provider in `src/radar/providers.ts:33-64`.
- WebView `fetch("https://api.librewxr.net/public/weather-maps.json")` for the frame catalogue, then `<img>` tiles using the returned host and path: `${host}${path}/256/{z}/{x}/{y}/2/1_1.png` (256 px tiles, colour scheme 2, smoothing 1, snow 1).
- Coverage claim in the app: 60°S–70°N; past 2 hours plus 1 hour nowcast; zoom 3–10.
- No custom headers. The request carries the WebView2 default User-Agent and the internal Tauri Referer. No Rust involvement, no API key.
- LibreWXR is the automatic first choice; RainViewer is the fallback and a manual picker.

### Terms

The public instance's terms allow apps and normal interactive use, require attribution, and permit commercial use of the data:

> "You are free to use, share, and adapt this data for any purpose, including commercial use, provided you give appropriate credit to LibreWXR." — <https://librewxr.net/#data-licensing>

The terms also say the public instance is best-effort, may be rate-limited or taken offline, and must not be bulk-downloaded or resold as a hosted API. Apps are explicitly invited: "Build personal projects, apps, sites, and prototypes against it." — <https://librewxr.net/terms.html>

Italy is a carve-out: tiles that include Italian DPC radar inherit CC BY-SA 4.0 and require a "Radar-DPC" credit; all other layers are CC BY 4.0. The app currently uses one global credit, so this is not preserved.

### Limits

- No published numeric limit. The terms say: "Normal interactive use, including animation playback, is always fine." — <https://librewxr.net/terms.html>
- Sustained excessive traffic, scraping or mirroring can be throttled or blocked; there is no SLA.
- A normal user's radar view loads one catalogue plus viewport tiles, and playback preloads only the current viewport's frames. This is the "normal interactive use" the terms describe. The public instance sits behind Cloudflare and sets cache headers, so repeat views are cheap.
- Per-user traffic is fine. Aggregate traffic from a very popular public release is the risk; self-hosting LibreWXR is the free escape hatch.

### Attribution currently shown

- In-map: "© OpenStreetMap contributors · Radar by LibreWXR (CC BY 4.0)" (`src/ui/radar.ts:380-383`), plain text, no link.
- README line 54 links to the LibreWXR GitHub repository and mentions CC BY 4.0.

Gaps: the credit is not a link to librewxr.net or the licence, and the underlying-provider/DPC attribution required by the terms is missing.

### Reliability

Best-effort public infrastructure with no SLA and a single maintainer, but it aggregates government radar sources and is already used by several public weather apps. The app's fallback path is sensible. For a public release, self-hosting LibreWXR (AGPL-3.0) or keeping a second provider is prudent.

### Verdict: CHANGE

1. Make the radar credit a link: `Weather data via <a href="https://librewxr.net/">LibreWXR</a> (CC BY 4.0)`.
2. Add `Radar-DPC` credit for Italian tiles, with a link to CC BY-SA 4.0, or restrict the app to non-Italian DPC layers if that is simpler.
3. Link the LibreWXR terms/licence in the README.

The source itself is allowed for this app; only attribution needs fixing.

---

## 3. RainViewer

### How the app calls it

- Fallback and manual picker in `src/radar/providers.ts:68-97`.
- WebView `fetch("https://api.rainviewer.com/public/weather-maps.json")`, then tile images from the returned host: `${host}${path}/256/{z}/{x}/{y}/2/1_1.png`; past frames only; zoom 3–7.
- Same WebView2 User-Agent/Referer as LibreWXR; no custom headers, no API key.
- In `auto` mode it is tried only after LibreWXR fails or does not cover the location. It is also selectable by the user.

### Terms

The current API page restricts the free API to personal and educational use:

> "This API is available for personal and educational use only." — <https://www.rainviewer.com/api.html>

The same page also describes "small-scale community use", but the explicit sentence above, and the FAQ's "free for personal, educational, and small-scale community use", do not clearly cover a publicly distributed app with unknown users. LibreWXR's README records that RainViewer restricted its free API tier on 1 January 2026 (<https://github.com/JoshuaKimsey/LibreWXR>).

If the app keeps RainViewer, the author should ask RainViewer for written permission and add the required visible link: "You must display credit such as 'Weather data by RainViewer' with a link back to rainviewer.com somewhere visible in your app or website."

### Limits

- No hard published limit; the FAQ asks clients to cache aggressively and says abuse may result in an IP block.
- No SLA; radar owners can withdraw data at any time.
- A normal user's traffic is not the issue; the licence scope is.

### Attribution currently shown

- In-map: "Radar by RainViewer" (`src/radar/providers.ts:89`), plain text, no link.
- README line 54 links to rainviewer.com.
- RainViewer requires a visible link, so this is also incomplete.

### Reliability

Reasonably reliable and globally available, but best-effort, with no guarantee that a particular radar stays in the feed. It is a useful technical fallback, but not a safe legal fallback for a public release.

### Verdict: REPLACE

Remove the RainViewer provider, the automatic fallback and the manual picker. Keep LibreWXR as the only radar source — it is already primary and is explicitly licensed for this use (CC BY 4.0, <https://librewxr.net/terms.html>). If a second source is wanted, self-host LibreWXR or ask RainViewer for written permission; do not ship the free tier as-is.

---

## 4. OpenStreetMap standard tiles (`tile.openstreetmap.org`)

### How the app calls it

- Radar base map: `https://tile.openstreetmap.org/{z}/{x}/{y}.png` in `src/ui/radar.ts:51-53`, loaded as `<img>` elements in `renderTiles` (`src/ui/radar.ts:448-455`). Zoom 3–10, default 6.
- Wind map base: the same URL pattern at fixed zoom 6 in `src/ui/windmap.ts:306`; tiles are laid out only for the current viewport.
- Both are WebView requests. No custom User-Agent, no `X-Requested-With`, no explicit Referer. WebView2 sends its default browser-like User-Agent; the Referer is the internal Tauri origin (`tauri.localhost`), not a public page.
- OSM attribution is rendered on both maps: "© OpenStreetMap contributors" (`src/ui/radar.ts:382`, `src/ui/windmap.ts:264`), and README line 56 links to the OSM copyright page.
- No bulk download or offline mode. Radar playback preloads radar frames, not OSM base tiles; OSM base tiles are fetched only for the current viewport.

### Terms

The Tile Usage Policy allows apps if they identify themselves, cache, attribute and avoid bulk use. The identification rule is explicit:

> "Apps must configure a distinct, stable User-Agent naming your app and optionally a contact URL or email." — <https://operations.osmfoundation.org/policies/tiles/>

It also says generic library defaults "will be blocked"; the policy's app section requires a distinct app User-Agent, so WebView2's default does not identify Skylark. Skylark has no Skylark-specific User-Agent, so it does not currently meet this requirement.

Heavy use is the other warning:

> "heavy or inappropriate use harms others’ ability to edit and view the map" — <https://operations.osmfoundation.org/policies/tiles/>

### Limits

- No numeric request cap. The policy is best-effort, with no SLA, and OSM may block access without notice if usage degrades the service.
- Caching: honour `Cache-Control`/`Expires`/`ETag`, or cache each tile for at least 7 days. WebView2's normal HTTP cache honours server headers and the app does not send no-cache headers, so this is largely satisfied by default, though there is no explicit 7-day fallback.
- Bulk downloading, pre-seeding, offline maps and prefetching tiles outside the viewport are prohibited. The app does none of these for OSM tiles.
- Normal interactive viewing is permitted. The aggregate load from a popular public app is the risk: these are donation-funded community servers, and a widely downloaded app can be classified as heavy use even if each individual user is light.

### Attribution currently shown

"© OpenStreetMap contributors" is visible on both maps and in the README. The policy wants the licence attribution clearly shown, typically with a link to <https://www.openstreetmap.org/copyright>. The text is present; the link is missing from the in-app credit.

### Reliability

Best-effort, no SLA, and access can be withdrawn or blocked without notice. The service is generally reliable for interactive use, but it is not a good long-term base for an app with an unknown, potentially large user base.

### Verdict: CHANGE

1. Send a distinct, contactable User-Agent for OSM tile requests, e.g. `Skylark/0.1.0 (+https://github.com/Ad1FPS/Skylark)`. Because the tiles are loaded by `<img>` in the WebView, either set the WebView2 user agent in the Tauri window configuration, or proxy OSM tile requests through Rust with that header. A Rust proxy is cleaner because it does not change the User-Agent for every other request.
2. Make "© OpenStreetMap contributors" a link to <https://www.openstreetmap.org/copyright>.
3. Keep the current cache-friendly behaviour and avoid any prefetch/offline feature.
4. Revisit the tile provider if the public release becomes popular; a dedicated OSM-derived provider or self-hosted tiles is the sustainable path.

If the User-Agent cannot be set, this should become REPLACE, because unidentified traffic is explicitly blockable under the policy.

---

## 5. ipwho.is

### How the app calls it

- Rust: `GET https://ipwho.is/?fields=success,city,region,country,latitude,longitude` (`src-tauri/src/weather.rs:736-744`), parsed by `parse_ip_location`.
- Called from the "Use my location" action, not on every launch; no cache. Shared `skylark/0.1` User-Agent; no API key.
- If the call fails or returns `success: false`, the app reports "Could not determine location" and the user can search manually.

### Terms

The free endpoint is documented as no-key and commercial-use-allowed:

> "The Free endpoint is limited to 1,000 requests per day per client IP address." — <https://ipwhois.io/documentation>

The general terms grant use "for your personal or internal business purposes" and prohibit redistributing or reselling the service (<https://ipwhois.io/terms>). A desktop app calling the endpoint on behalf of its user is ordinary use of the service, not redistribution; the app does not expose the API as its own service.

### Limits

- 1,000 requests/day per client IP; HTTP 429 after that, with a `Retry-After` header and automatic reset after 24 hours.
- CORS requests are counted per domain and share one quota; Skylark calls from Rust, so each user's own IP is the unit and CORS does not apply.
- A normal user calls this only when pressing "Use my location", so 1,000/day is ample. Users behind a large shared NAT could share the quota, but failure is handled gracefully with manual search.
- No SLA on the free endpoint.

### Attribution currently shown

Not required by ipwho.is. README line 57 credits it with a link. That is sufficient.

### Reliability

Fine for a one-shot, best-effort location lookup. No SLA; the manual search path is the fallback. No change needed.

### Verdict: KEEP

No action. The free limit is per user IP, the call is user-initiated and rare, and attribution already exists. Optionally add a one-line note in the README that IP location is approximate.

---

## 6. NWS `api.weather.gov` (US alerts)

### How the app calls it

- Rust: `GET https://api.weather.gov/alerts/active?point={lat:.4},{lon:.4}` (`src-tauri/src/alerts.rs:115-133`), with:
  - `User-Agent: (Skylark weather app, https://github.com/Ad1FPS/Skylark)`
  - `Accept: application/geo+json`
- Only for United States locations (`provider_for` checks country strings).
- Cached in memory for 5 minutes (`CACHE_TTL_SECS = 300`), with stale-cache fallback on error.

### Terms

NWS data is open data, free for any purpose, with a User-Agent requirement:

> "All of the information presented via the API is intended to be open data, free to use for any purpose." — <https://www.weather.gov/documentation/services-web-api>

> "A User Agent is required to identify your application." — same page

The app's User-Agent includes the app name and a contact URL, which matches the documented example `(myweatherapp.com, contact@myweatherapp.com)`.

### Limits

- The rate limit is not public. NWS describes it as "a generous amount for typical use" and says direct client requests are unlikely to hit it; proxies are more likely.
- Exceeding it returns an error and can be retried after the limit clears, typically within 5 seconds.
- The app's 5-minute cache and one request per location are well within normal use.
- No SLA, but this is an official US government service.

### Attribution currently shown

Not required (US government open data). The alert detail shows the sender, normally "National Weather Service", and README line 55 links to the API docs. Good.

### Reliability

Official source for US alerts; generally reliable. Alerts are shown as published, and the README already warns users to follow local authorities in an emergency. Keep the 5-minute cache.

### Verdict: KEEP

No change. The User-Agent already meets the requirement.

---

## 7. Bright Sky (`api.brightsky.dev`, DWD alerts for Germany)

### How the app calls it

- Rust: `GET https://api.brightsky.dev/alerts?lat={lat:.4}&lon={lon:.4}` (`src-tauri/src/alerts.rs:135-147`).
- Only for German locations; shared `skylark/0.1` User-Agent; no API key; no special `Accept` header.
- 5-minute in-memory cache with stale-cache fallback, same as NWS.

### Terms

Bright Sky is free for all purposes, and the underlying DWD data is CC BY 4.0:

> "Bright Sky is free-to-use for all purposes." — <https://brightsky.dev/>

> "Re-use is permitted solely under the terms of the Creative Commons license BY 4.0 providing the source is duly acknowledged." — <https://www.dwd.de/EN/service/legal_notice/legal_notice.html>

This is a free, non-commercial-friendly API with no key requirements, so it is compatible with a public MIT app.

### Limits

- No published per-IP or per-key limit. Bright Sky's homepage says it handles more than two million requests/day; the project asks users to be considerate and offers self-hosting.
- The app's 5-minute cache and one request per location are modest. Normal user traffic is fine.
- No SLA; best-effort, single-maintainer service.

### Attribution currently shown

DWD attribution is effectively present: `sender` is the constant "Deutscher Wetterdienst" (`src-tauri/src/alerts.rs:14`), which is shown with the alert, and README line 55 credits "the German Weather Service (DWD) via Bright Sky". This satisfies "source duly acknowledged" for the alerts.

### Reliability

Good for German DWD alerts; best-effort, no SLA, with a single maintainer. The stale-cache fallback is appropriate. No change needed.

### Verdict: KEEP

No change. If the app later displays DWD data outside the alert detail, add an explicit "Source: Deutscher Wetterdienst (CC BY 4.0)" credit there.

---

## Alerts coverage options

### Europe: Meteoalarm

Meteoalarm publishes free, public Atom feeds per country. The current feed index is <https://feeds.meteoalarm.org/>.

- Pattern: `https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-{country}` (lower-case country slug, hyphens; e.g. `...-germany`, `...-united-kingdom`, `...-czechia`, `...-republic-of-north-macedonia`).
- Countries/territories currently listed (39): Andorra, Austria, Belgium, Bosnia and Herzegovina, Bulgaria, Croatia, Cyprus, Czechia, Denmark, Estonia, Finland, France, Germany, Greece, Hungary, Iceland, Ireland, Israel, Italy, Latvia, Lithuania, Luxembourg, Malta, Moldova, Montenegro, Netherlands, North Macedonia, Norway, Poland, Portugal, Romania, Serbia, Slovakia, Slovenia, Spain, Sweden, Switzerland, Ukraine, United Kingdom.
- Format: Atom 1.0 entries carrying CAP 1.2 fields (`cap:event`, `cap:severity`, `cap:urgency`, `cap:onset`, `cap:expires`, `cap:areaDesc`, `EMMA_ID` geocode), with a link to the full CAP XML for each warning.
- Terms: the feed's `rights` element says: "Licensed under terms equivalent to CC BY 4.0, with additional requirements for redistributing..." (<https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-germany>). The API portal also labels the data CC BY 4.0 (<https://api.meteoalarm.org/edr/v1?f=html>). Attribute MeteoAlarm / EUMETNET members and link to meteoalarm.org.
- The OGC EDR API at <https://api.meteoalarm.org/edr/v1> requires a token for location queries and is aimed at Meteoalarm members and redistributors; the public Atom feeds are the practical free route for an app like Skylark.
- Implementation note: the app already has a per-country provider switch. A Meteoalarm provider would select the feed by `Location.country`, then filter entries by EMMA_ID/area or by the CAP polygon in the linked XML. The feed itself does not give a point-to-polygon lookup, so some geocoding work is required.

### Outside Europe and the US

Confirmed free public machine-readable alert sources:

| Country | Feed | Format | Terms / notes |
|---|---|---|---|
| Canada | `https://api.weather.gc.ca/collections/weather-alerts/items?f=json` (GeoJSON; also `https://dd.weather.gc.ca/today/alerts/cap/{YYYYMMDD}/{EEEE}/{hh}/` for CAP XML) | GeoJSON / CAP 1.2 | ECCC Data Services End-use Licence v2.1.1: free for any lawful purpose including commercial use; attribute "Data Source: Environment and Climate Change Canada"; alerts must not be altered in content or intent. <https://eccc-msc.github.io/open-data/licence/readme_en/> |
| Norway | `https://api.met.no/weatherapi/metalerts/2.0/current.json` (JSON); CAP per alert via the `cap` query parameter | GeoJSON / CAP | CC BY 4.0; identifying User-Agent required; keep total traffic below 20 requests/second; poll no more than once per 10 minutes for push. <https://api.met.no/doc/TermsOfService> |
| Ireland | `https://www.met.ie/Open_Data/json/warning_IRELAND.json` | JSON | Met Éireann Open Data: CC BY 4.0 for most datasets; five attribution statements required (copyright, source met.ie, licence, disclaimer, modifications). Live forecast data may use a custom licence; warnings are the relevant dataset. <https://www.met.ie/about-us/specialised-services/open-data> |
| Germany | `https://api.brightsky.dev/alerts?lat=...&lon=...` (already used) | JSON | Bright Sky free for all purposes; DWD CC BY 4.0. <https://brightsky.dev/> |
| United States | `https://api.weather.gov/alerts/active?point=...` (already used) | GeoJSON / CAP | NWS open data, free for any purpose; identifying User-Agent required. <https://www.weather.gov/documentation/services-web-api> |

Other useful references, but not confirmed as free public feeds for this app:

- WMO Register of Alerting Authorities: <https://alertingauthority.wmo.int/> — an index of national authorities, not a feed. It lists 190+ members, but listing does not imply a public machine-readable feed.
- WMO Severe Weather Information Centre: <https://severeweather.wmo.int/sources.html> — aggregates declared CAP feeds from participating agencies; useful for discovery, but each feed still has its own terms.
- Australia: the Bureau of Meteorology's public API at `https://api.weather.bom.gov.au/v1/...` returns a copyright notice saying "You must not use, copy or share it." It is therefore not an option without a data-services agreement. <https://www.bom.gov.au/resources/data-services>

No single global free CAP/JSON API was confirmed. Coverage is country-by-country; the practical set for Skylark is Meteoalarm for Europe, NWS for the US, ECCC for Canada, MET Norway for Norway, Met Éireann for Ireland, and Bright Sky/DWD for Germany.

---

## Summary table

| Source | Verdict | One-line action |
|---|---|---|
| Open-Meteo (forecast, minutely_15, air quality, geocoding, archive, wind) | CHANGE | Add an in-app "Weather data by Open-Meteo.com" link plus CC BY 4.0; keep the free non-commercial use and current request volume. |
| LibreWXR public instance (`api.librewxr.net`) | CHANGE | Link the radar credit to librewxr.net / CC BY 4.0 and add the "Radar-DPC" credit for Italian tiles. |
| RainViewer | REPLACE | Remove the provider, fallback and manual picker; use LibreWXR only (CC BY 4.0, <https://librewxr.net/terms.html>). |
| OpenStreetMap standard tiles | CHANGE | Send `Skylark/0.1.0 (+https://github.com/Ad1FPS/Skylark)` for tile requests (or proxy them) and link the OSM copyright notice. |
| ipwho.is | KEEP | No change; 1,000 requests/day per client IP is ample and the lookup is user-initiated. |
| NWS `api.weather.gov` | KEEP | No change; the User-Agent already identifies the app and the 5-minute cache is appropriate. |
| Bright Sky (`api.brightsky.dev`) | KEEP | No change; free for all purposes, DWD source is shown, 5-minute cache is appropriate. |
