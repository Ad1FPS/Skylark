use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::Http;
use crate::regions;
use crate::weather::Location;

const NWS_URL: &str = "https://api.weather.gov/alerts/active";
const BRIGHTSKY_URL: &str = "https://api.brightsky.dev/alerts";
const METEOALARM_URL: &str = "https://feeds.meteoalarm.org/api/v1/warnings";
const ECCC_URL: &str = "https://api.weather.gc.ca/collections/weather-alerts/items";
pub(crate) const APP_USER_AGENT: &str =
    "(Skylark weather app, https://github.com/Ad1FPS/Skylark)";
const CACHE_TTL_SECS: i64 = 300;
const METEOALARM_CACHE_TTL_SECS: i64 = 600;
const DWD_SENDER: &str = "Deutscher Wetterdienst";
const METEOALARM_SENDER: &str = "MeteoAlarm (EUMETNET)";
const METEOALARM_SOURCE: &str = "Meteoalarm";
const ECCC_SOURCE: &str = "Environment and Climate Change Canada";

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Alert {
    pub id: String,
    pub event: String,
    pub severity: String,
    pub headline: String,
    pub description: String,
    pub instruction: Option<String>,
    pub onset: Option<i64>,
    pub ends: Option<i64>,
    pub sender: String,
    pub source: String,
}

/// The alerts themselves plus whether the location's country has an official provider.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AlertsResponse {
    pub covered: bool,
    pub alerts: Vec<Alert>,
}

#[derive(Default)]
pub struct AlertCache {
    /// Parsed alerts per location, cheap to serve for a few minutes.
    alerts: Mutex<std::collections::HashMap<String, (i64, Vec<Alert>)>>,
    /// Raw Meteoalarm response per country slug, shared by every city in that country.
    meteo: Mutex<std::collections::HashMap<String, (i64, String)>>,
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Provider {
    Nws,
    Eccc,
    Dwd,
    Meteoalarm(&'static str),
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn provider_for(country: &str) -> Option<Provider> {
    let c = country.trim().to_lowercase();
    let slug = match c.as_str() {
        "united states" | "united states of america" | "usa" | "us" => return Some(Provider::Nws),
        "canada" | "ca" => return Some(Provider::Eccc),
        "germany" | "deutschland" | "de" => return Some(Provider::Dwd),
        "andorra" => "andorra",
        "austria" => "austria",
        "belgium" => "belgium",
        "bosnia and herzegovina" | "bosnia" | "bosnia & herzegovina" => {
            "bosnia-and-herzegovina"
        }
        "bulgaria" => "bulgaria",
        "croatia" => "croatia",
        "cyprus" => "cyprus",
        "czechia" | "czech republic" | "czech" => "czechia",
        "denmark" => "denmark",
        "estonia" => "estonia",
        "finland" => "finland",
        "france" => "france",
        "greece" => "greece",
        "hungary" => "hungary",
        "iceland" => "iceland",
        "ireland" => "ireland",
        "israel" => "israel",
        "italy" => "italy",
        "latvia" => "latvia",
        "lithuania" => "lithuania",
        "luxembourg" => "luxembourg",
        "malta" => "malta",
        "moldova" | "republic of moldova" => "moldova",
        "montenegro" => "montenegro",
        "netherlands" | "the netherlands" | "holland" => "netherlands",
        "north macedonia" | "republic of north macedonia" | "macedonia" => {
            "republic-of-north-macedonia"
        }
        "norway" => "norway",
        "poland" => "poland",
        "portugal" => "portugal",
        "romania" => "romania",
        "serbia" => "serbia",
        "slovakia" => "slovakia",
        "slovenia" => "slovenia",
        "spain" => "spain",
        "sweden" => "sweden",
        "switzerland" => "switzerland",
        "ukraine" => "ukraine",
        "united kingdom" | "uk" | "great britain" | "britain" => "united-kingdom",
        _ => return None,
    };
    Some(Provider::Meteoalarm(slug))
}

#[tauri::command]
pub async fn get_alerts(
    app: tauri::AppHandle,
    http: State<'_, Http>,
    cache: State<'_, AlertCache>,
    location: Location,
) -> Result<AlertsResponse, String> {
    if let Ok(dir) = crate::commands::data_dir(&app) {
        regions::set_data_dir(dir);
    }
    let covered = provider_for(&location.country).is_some();
    let alerts = alerts_for(&http.0, &cache, &location).await?;
    Ok(AlertsResponse { covered, alerts })
}

/// Alerts for a location, served from the 5 minute cache when possible. Shared with the background refresh.
pub async fn alerts_for(
    http: &reqwest::Client,
    cache: &AlertCache,
    location: &Location,
) -> Result<Vec<Alert>, String> {
    let Some(provider) = provider_for(&location.country) else {
        return Ok(vec![]);
    };

    let key = format!("{:.2},{:.2}", location.latitude, location.longitude);
    let now = now_secs();

    let cached = cache.alerts.lock().ok().and_then(|map| map.get(&key).cloned());
    if let Some((fetched_at, alerts)) = &cached
        && now - fetched_at < CACHE_TTL_SECS
    {
        return Ok(alerts.clone());
    }

    let fetched = match provider {
        Provider::Nws => fetch_nws(http, location.latitude, location.longitude).await,
        Provider::Eccc => fetch_eccc(http, location.latitude, location.longitude, now).await,
        Provider::Dwd => fetch_dwd(http, location.latitude, location.longitude).await,
        Provider::Meteoalarm(slug) => fetch_meteoalarm(http, cache, slug, location, now).await,
    };

    let alerts = match fetched {
        Ok(alerts) => alerts,
        Err(e) => {
            if let Some((_, alerts)) = cached {
                return Ok(alerts);
            }
            return Err(e);
        }
    };

    if let Ok(mut map) = cache.alerts.lock() {
        map.insert(key, (now, alerts.clone()));
    }

    Ok(alerts)
}

async fn fetch_nws(
    http: &reqwest::Client,
    latitude: f64,
    longitude: f64,
) -> Result<Vec<Alert>, String> {
    let url = format!("{NWS_URL}?point={latitude:.4},{longitude:.4}");
    let res = http
        .get(url)
        .header("User-Agent", APP_USER_AGENT)
        .header("Accept", "application/geo+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("nws request failed: {}", res.status()));
    }
    let text = res.text().await.map_err(|e| e.to_string())?;
    Ok(finalize(parse_nws(&text)))
}

async fn fetch_dwd(
    http: &reqwest::Client,
    latitude: f64,
    longitude: f64,
) -> Result<Vec<Alert>, String> {
    let url = format!("{BRIGHTSKY_URL}?lat={latitude:.4}&lon={longitude:.4}");
    let res = http.get(url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("brightsky request failed: {}", res.status()));
    }
    let text = res.text().await.map_err(|e| e.to_string())?;
    Ok(finalize(parse_dwd(&text)))
}

async fn fetch_eccc(
    http: &reqwest::Client,
    latitude: f64,
    longitude: f64,
    now: i64,
) -> Result<Vec<Alert>, String> {
    let bbox = format!(
        "{:.4},{:.4},{:.4},{:.4}",
        longitude - 0.01,
        latitude - 0.01,
        longitude + 0.01,
        latitude + 0.01
    );
    let url = format!("{ECCC_URL}?f=json&bbox={bbox}&limit=100");
    let res = http
        .get(url)
        .header("User-Agent", APP_USER_AGENT)
        .header("Accept", "application/geo+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("eccc request failed: {}", res.status()));
    }
    let text = res.text().await.map_err(|e| e.to_string())?;
    Ok(finalize(parse_eccc(&text, latitude, longitude, now)))
}

async fn fetch_meteo_raw(http: &reqwest::Client, slug: &str) -> Result<String, String> {
    let url = format!("{METEOALARM_URL}/feeds-{slug}");
    let res = http
        .get(url)
        .header("User-Agent", APP_USER_AGENT)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("meteoalarm request failed: {}", res.status()));
    }
    res.text().await.map_err(|e| e.to_string())
}

async fn fetch_meteoalarm(
    http: &reqwest::Client,
    cache: &AlertCache,
    slug: &str,
    location: &Location,
    now: i64,
) -> Result<Vec<Alert>, String> {
    let cached = cache
        .meteo
        .lock()
        .ok()
        .and_then(|map| map.get(slug).cloned());

    // One raw response per country feeds every saved city in it.
    let raw = match cached {
        Some((fetched_at, raw)) if now - fetched_at < METEOALARM_CACHE_TTL_SECS => raw,
        stale => match fetch_meteo_raw(http, slug).await {
            Ok(raw) => {
                if let Ok(mut map) = cache.meteo.lock() {
                    map.insert(slug.to_string(), (now, raw.clone()));
                }
                raw
            }
            Err(e) => match stale {
                Some((_, raw)) => raw,
                None => return Err(e),
            },
        },
    };

    let names = regions::region_names(http, location).await;
    Ok(finalize(parse_meteoalarm(
        &raw,
        location.latitude,
        location.longitude,
        &names,
        now,
    )))
}

/// Alerts already announced for a location, kept so each one raises a notification only once.
#[derive(Serialize, Deserialize, Default)]
struct SeenAlerts {
    key: String,
    ids: Vec<String>,
}

/// Raises a system notification for each moderate-or-worse alert that was not there at the previous check.
/// The first check for a location only records what is already active, so turning notifications on or
/// switching city never fires a burst of old news.
pub fn notify_new(app: &tauri::AppHandle, location: &Location, alerts: &[Alert]) {
    use tauri_plugin_notification::NotificationExt;

    if !crate::commands::ALERT_NOTIFICATIONS.load(std::sync::atomic::Ordering::Relaxed) {
        return;
    }
    let Ok(dir) = crate::commands::data_dir(app) else {
        return;
    };
    let path = dir.join("alerts_seen.json");
    let key = format!("{:.2},{:.2}", location.latitude, location.longitude);
    let previous: Option<SeenAlerts> = std::fs::read_to_string(&path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok());

    if let Some(prev) = previous.as_ref().filter(|p| p.key == key) {
        for alert in alerts {
            if severity_rank(&alert.severity) > 2 || prev.ids.contains(&alert.id) {
                continue;
            }
            let body: String = format!("{}: {}", location.name, alert.headline).chars().take(220).collect();
            let _ = app.notification().builder().title(&alert.event).body(body).show();
        }
    }

    let seen = SeenAlerts {
        key,
        ids: alerts.iter().map(|a| a.id.clone()).collect(),
    };
    if let Ok(text) = serde_json::to_string(&seen) {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(&path, text);
    }
}

/// Drops expired alerts, then sorts most severe first.
fn finalize(mut alerts: Vec<Alert>) -> Vec<Alert> {
    let now = now_secs();
    alerts.retain(|a| a.ends.is_none_or(|end| end > now));
    sort_alerts(&mut alerts);
    alerts
}

fn severity_rank(severity: &str) -> u8 {
    match severity {
        "extreme" => 0,
        "severe" => 1,
        "moderate" => 2,
        _ => 3,
    }
}

fn sort_alerts(alerts: &mut [Alert]) {
    alerts.sort_by(|a, b| {
        severity_rank(&a.severity)
            .cmp(&severity_rank(&b.severity))
            .then_with(|| match (a.onset, b.onset) {
                (Some(x), Some(y)) => x.cmp(&y),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => std::cmp::Ordering::Equal,
            })
    });
}

fn normalize_severity(raw: Option<&str>) -> String {
    let s = raw.unwrap_or("").to_lowercase();
    match s.as_str() {
        "minor" | "moderate" | "severe" | "extreme" => s,
        _ => "minor".to_string(),
    }
}

fn clean_instruction(raw: Option<&str>) -> Option<String> {
    let trimmed = raw.unwrap_or("").trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn first_non_empty(candidates: &[Option<&str>]) -> String {
    for s in candidates.iter().flatten() {
        let trimmed = s.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    String::new()
}

fn capitalize_first(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

#[derive(Deserialize)]
struct NwsResponse {
    #[serde(default)]
    features: Vec<NwsFeature>,
}

#[derive(Deserialize)]
struct NwsFeature {
    properties: Option<NwsProps>,
}

#[derive(Deserialize)]
struct NwsProps {
    id: Option<String>,
    event: Option<String>,
    severity: Option<String>,
    headline: Option<String>,
    description: Option<String>,
    instruction: Option<String>,
    onset: Option<String>,
    effective: Option<String>,
    ends: Option<String>,
    expires: Option<String>,
    #[serde(rename = "senderName")]
    sender_name: Option<String>,
    sender: Option<String>,
    status: Option<String>,
    #[serde(rename = "messageType")]
    message_type: Option<String>,
}

pub fn parse_nws(json: &str) -> Vec<Alert> {
    let Ok(resp) = serde_json::from_str::<NwsResponse>(json) else {
        return vec![];
    };
    let mut out = Vec::new();
    for feature in resp.features {
        let Some(p) = feature.properties else { continue };
        if let Some(status) = &p.status
            && !status.eq_ignore_ascii_case("Actual")
        {
            continue;
        }
        if let Some(mt) = &p.message_type
            && mt.eq_ignore_ascii_case("Cancel")
        {
            continue;
        }
        let Some(id) = p.id.as_deref().map(str::trim).filter(|s| !s.is_empty()) else {
            continue;
        };
        let event = p.event.as_deref().unwrap_or_default().trim().to_string();
        let headline = first_non_empty(&[p.headline.as_deref(), p.event.as_deref()]);
        let description = p.description.as_deref().unwrap_or_default().trim().to_string();
        let instruction = clean_instruction(p.instruction.as_deref());
        let onset = p
            .onset
            .as_deref()
            .and_then(parse_iso)
            .or_else(|| p.effective.as_deref().and_then(parse_iso));
        let ends = p
            .ends
            .as_deref()
            .and_then(parse_iso)
            .or_else(|| p.expires.as_deref().and_then(parse_iso));
        let sender = first_non_empty(&[
            p.sender_name.as_deref(),
            p.sender.as_deref(),
            Some("National Weather Service"),
        ]);
        out.push(Alert {
            id: format!("nws:{id}"),
            event,
            severity: normalize_severity(p.severity.as_deref()),
            headline,
            description,
            instruction,
            onset,
            ends,
            sender,
            source: "NWS".to_string(),
        });
    }
    out
}

#[derive(Deserialize)]
struct DwbResponse {
    #[serde(default)]
    alerts: Vec<DwbAlert>,
}

#[derive(Deserialize)]
struct DwbAlert {
    alert_id: Option<i64>,
    event_en: Option<String>,
    event_de: Option<String>,
    severity: Option<String>,
    headline_en: Option<String>,
    headline_de: Option<String>,
    description_en: Option<String>,
    description_de: Option<String>,
    instruction_en: Option<String>,
    instruction_de: Option<String>,
    onset: Option<String>,
    expires: Option<String>,
    status: Option<String>,
}

pub fn parse_dwd(json: &str) -> Vec<Alert> {
    let Ok(resp) = serde_json::from_str::<DwbResponse>(json) else {
        return vec![];
    };
    let mut out = Vec::new();
    for a in resp.alerts {
        if let Some(status) = &a.status
            && !status.eq_ignore_ascii_case("actual")
        {
            continue;
        }
        let Some(alert_id) = a.alert_id else { continue };
        let raw_event = first_non_empty(&[a.event_en.as_deref(), a.event_de.as_deref()]);
        let event = capitalize_first(&raw_event);
        let headline = first_non_empty(&[
            a.headline_en.as_deref(),
            a.headline_de.as_deref(),
            Some(&raw_event),
        ]);
        let description =
            first_non_empty(&[a.description_en.as_deref(), a.description_de.as_deref()]);
        let instruction = clean_instruction(
            a.instruction_en
                .as_deref()
                .or(a.instruction_de.as_deref()),
        );
        let onset = a.onset.as_deref().and_then(parse_iso);
        let ends = a.expires.as_deref().and_then(parse_iso);
        out.push(Alert {
            id: format!("dwd:{alert_id}"),
            event,
            severity: normalize_severity(a.severity.as_deref()),
            headline,
            description,
            instruction,
            onset,
            ends,
            sender: DWD_SENDER.to_string(),
            source: "DWD".to_string(),
        });
    }
    out
}

#[derive(Deserialize)]
struct EcccResponse {
    #[serde(default)]
    features: Vec<EcccFeature>,
}

#[derive(Deserialize)]
struct EcccFeature {
    geometry: Option<EcccGeometry>,
    properties: Option<EcccProps>,
}

#[derive(Deserialize)]
struct EcccGeometry {
    #[serde(rename = "type")]
    kind: Option<String>,
    #[serde(default)]
    coordinates: serde_json::Value,
}

#[derive(Deserialize)]
struct EcccProps {
    alert_code: Option<String>,
    alert_name_en: Option<String>,
    alert_short_name_en: Option<String>,
    alert_text_en: Option<String>,
    alert_type: Option<String>,
    expiration_datetime: Option<String>,
    feature_name_en: Option<String>,
    publication_datetime: Option<String>,
    risk_colour_en: Option<String>,
    status_en: Option<String>,
    validity_datetime: Option<String>,
}

/// Alerts from the ECCC OGC API that apply to a point. `now` is passed in so the fixture tests can pin the clock.
pub fn parse_eccc(json: &str, latitude: f64, longitude: f64, now: i64) -> Vec<Alert> {
    let Ok(response) = serde_json::from_str::<EcccResponse>(json) else {
        return vec![];
    };
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for feature in response.features {
        let (Some(geometry), Some(p)) = (feature.geometry, feature.properties) else {
            continue;
        };
        if p.status_en.as_deref().is_some_and(|status| {
            status.eq_ignore_ascii_case("ended") || status.eq_ignore_ascii_case("cancelled")
        }) {
            continue;
        }
        let ends = p.expiration_datetime.as_deref().and_then(parse_iso);
        if ends.is_some_and(|ends| ends <= now) {
            continue;
        }
        if !eccc_geometry_contains(&geometry, latitude, longitude) {
            continue;
        }
        let Some(code) = p
            .alert_code
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        else {
            continue;
        };
        let area = p
            .feature_name_en
            .as_deref()
            .unwrap_or_default()
            .trim()
            .to_string();
        let raw_name =
            first_non_empty(&[p.alert_name_en.as_deref(), p.alert_short_name_en.as_deref()]);
        let event = capitalize_first(&raw_name);
        if event.is_empty() {
            continue;
        }
        // Several polygons can repeat the same warning; keep one card per alert and area.
        let dedupe_key = format!("{}|{}", code.to_lowercase(), area.to_lowercase());
        if !seen.insert(dedupe_key) {
            continue;
        }
        let onset = p
            .validity_datetime
            .as_deref()
            .and_then(parse_iso)
            .or_else(|| p.publication_datetime.as_deref().and_then(parse_iso));
        out.push(Alert {
            id: format!("eccc:{code}:{area}"),
            event,
            severity: eccc_severity(p.alert_type.as_deref(), p.risk_colour_en.as_deref()),
            headline: area,
            description: p.alert_text_en.unwrap_or_default(),
            instruction: None,
            onset,
            ends,
            sender: ECCC_SOURCE.to_string(),
            source: ECCC_SOURCE.to_string(),
        });
    }
    out
}

fn eccc_severity(alert_type: Option<&str>, risk_colour: Option<&str>) -> String {
    if risk_colour.is_some_and(|colour| colour.eq_ignore_ascii_case("red")) {
        return "extreme".to_string();
    }
    let mapped = match alert_type.unwrap_or_default().trim().to_lowercase().as_str() {
        "warning" => "severe",
        "watch" | "advisory" => "moderate",
        // Statements and unknown types are the mildest category.
        _ => "minor",
    };
    normalize_severity(Some(mapped))
}

/// GeoJSON coordinates hold `[longitude, latitude]` pairs; the point test works in `(latitude, longitude)`.
fn eccc_geometry_contains(geometry: &EcccGeometry, latitude: f64, longitude: f64) -> bool {
    let Some(coordinates) = geometry.coordinates.as_array() else {
        return false;
    };
    match geometry.kind.as_deref() {
        Some("Polygon") => coordinates
            .first()
            .and_then(eccc_ring)
            .is_some_and(|ring| point_in_polygon(latitude, longitude, &ring)),
        Some("MultiPolygon") => coordinates.iter().any(|polygon| {
            polygon
                .as_array()
                .and_then(|rings| rings.first())
                .and_then(eccc_ring)
                .is_some_and(|ring| point_in_polygon(latitude, longitude, &ring))
        }),
        _ => false,
    }
}

fn eccc_ring(value: &serde_json::Value) -> Option<Vec<(f64, f64)>> {
    let points: Vec<(f64, f64)> = value
        .as_array()?
        .iter()
        .filter_map(|point| {
            let pair = point.as_array()?;
            Some((pair.get(1)?.as_f64()?, pair.first()?.as_f64()?))
        })
        .collect();
    (points.len() >= 3).then_some(points)
}

#[derive(Deserialize)]
struct MeteoalarmResponse {
    #[serde(default)]
    warnings: Vec<MeteoWarning>,
}

#[derive(Deserialize)]
struct MeteoWarning {
    alert: Option<MeteoAlert>,
}

#[derive(Deserialize)]
struct MeteoAlert {
    identifier: Option<String>,
    #[serde(rename = "msgType")]
    message_type: Option<String>,
    status: Option<String>,
    #[serde(default)]
    info: Vec<MeteoInfo>,
}

#[derive(Deserialize)]
struct MeteoInfo {
    language: Option<String>,
    event: Option<String>,
    severity: Option<String>,
    onset: Option<String>,
    effective: Option<String>,
    expires: Option<String>,
    headline: Option<String>,
    description: Option<String>,
    instruction: Option<String>,
    #[serde(rename = "senderName")]
    sender_name: Option<String>,
    #[serde(default)]
    area: Vec<MeteoArea>,
}

#[derive(Deserialize)]
struct MeteoArea {
    #[serde(rename = "areaDesc")]
    area_desc: Option<String>,
    polygon: Option<Vec<String>>,
}

/// Alerts from a Meteoalarm country feed that apply to a point or its region names.
/// `now` is passed in so the fixture tests can pin the clock.
pub fn parse_meteoalarm(
    json: &str,
    latitude: f64,
    longitude: f64,
    region_names: &[String],
    now: i64,
) -> Vec<Alert> {
    let Ok(response) = serde_json::from_str::<MeteoalarmResponse>(json) else {
        return vec![];
    };
    let mut out = Vec::new();
    for warning in response.warnings {
        let Some(alert) = warning.alert else { continue };
        if let Some(status) = &alert.status
            && !status.eq_ignore_ascii_case("Actual")
        {
            continue;
        }
        if let Some(message_type) = &alert.message_type
            && message_type.eq_ignore_ascii_case("Cancel")
        {
            continue;
        }
        let Some(info) = english_info(&alert.info) else {
            continue;
        };

        let raw_event = info.event.as_deref().unwrap_or_default().trim();
        if info
            .severity
            .as_deref()
            .is_some_and(|severity| severity.eq_ignore_ascii_case("minor"))
        {
            continue;
        }
        if raw_event.to_lowercase().starts_with("green") {
            continue;
        }
        let expires = info.expires.as_deref().and_then(parse_iso);
        if expires.is_some_and(|expires| expires <= now) {
            continue;
        }
        if !matches_area(info, latitude, longitude, region_names) {
            continue;
        }
        let Some(identifier) = alert
            .identifier
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        else {
            continue;
        };

        let event = capitalize_first(raw_event);
        out.push(Alert {
            id: format!("meteoalarm:{identifier}"),
            event,
            severity: normalize_severity(info.severity.as_deref()),
            headline: first_non_empty(&[info.headline.as_deref(), info.event.as_deref()]),
            description: first_non_empty(&[info.description.as_deref()]),
            instruction: clean_instruction(info.instruction.as_deref()),
            onset: info
                .onset
                .as_deref()
                .and_then(parse_iso)
                .or_else(|| info.effective.as_deref().and_then(parse_iso)),
            ends: expires,
            sender: first_non_empty(&[info.sender_name.as_deref(), Some(METEOALARM_SENDER)]),
            source: METEOALARM_SOURCE.to_string(),
        });
    }
    out
}

fn english_info(info: &[MeteoInfo]) -> Option<&MeteoInfo> {
    info.iter()
        .find(|entry| {
            entry
                .language
                .as_deref()
                .is_some_and(|language| language.to_ascii_lowercase().starts_with("en"))
        })
        .or_else(|| info.first())
}

/// Polygons win when a warning has them; otherwise the area names have to match.
fn matches_area(info: &MeteoInfo, latitude: f64, longitude: f64, region_names: &[String]) -> bool {
    let rings: Vec<Vec<(f64, f64)>> = info
        .area
        .iter()
        .flat_map(|area| area.polygon.as_deref().unwrap_or(&[]))
        .filter_map(|polygon| parse_polygon(polygon.as_str()))
        .collect();
    if !rings.is_empty() {
        return rings
            .iter()
            .any(|ring| point_in_polygon(latitude, longitude, ring));
    }

    info.area.iter().any(|area| {
        area.area_desc.as_deref().is_some_and(|area_desc| {
            region_names
                .iter()
                .any(|region| names_match(area_desc, region))
        })
    })
}

/// One polygon entry is a space-separated list of `lat,lon` pairs.
fn parse_polygon(raw: &str) -> Option<Vec<(f64, f64)>> {
    let points: Vec<(f64, f64)> = raw
        .split_whitespace()
        .filter_map(|pair| {
            let (lat, lon) = pair.split_once(',')?;
            Some((lat.trim().parse().ok()?, lon.trim().parse().ok()?))
        })
        .collect();
    (points.len() >= 3).then_some(points)
}

/// Ray casting on a ring of `(latitude, longitude)` points.
fn point_in_polygon(latitude: f64, longitude: f64, ring: &[(f64, f64)]) -> bool {
    if ring.len() < 3 {
        return false;
    }
    let mut inside = false;
    let mut j = ring.len() - 1;
    for (i, &(yi, xi)) in ring.iter().enumerate() {
        let (yj, xj) = ring[j];
        if (yi > latitude) != (yj > latitude)
            && longitude < (xj - xi) * (latitude - yi) / (yj - yi) + xi
        {
            inside = !inside;
        }
        j = i;
    }
    inside
}

/// Lower-case, strip accents and punctuation, collapse whitespace.
fn normalize_name(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    let mut pending_space = false;
    for c in name.chars() {
        for lower in c.to_lowercase() {
            let folded = fold_char(lower);
            if folded.is_empty() {
                if lower.is_alphanumeric() {
                    if pending_space && !out.is_empty() {
                        out.push(' ');
                    }
                    out.push(lower);
                    pending_space = false;
                } else {
                    pending_space = true;
                }
                continue;
            }
            for c in folded.chars() {
                if pending_space && !out.is_empty() {
                    out.push(' ');
                }
                out.push(c);
                pending_space = false;
            }
        }
    }
    out
}

fn fold_char(c: char) -> &'static str {
    match c {
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' | 'ā' | 'ă' | 'ą' => "a",
        'ç' | 'ć' | 'č' | 'ĉ' | 'ċ' => "c",
        'ď' | 'đ' | 'ð' => "d",
        'è' | 'é' | 'ê' | 'ë' | 'ē' | 'ĕ' | 'ė' | 'ę' | 'ě' => "e",
        'ğ' | 'ĝ' | 'ġ' | 'ģ' => "g",
        'ì' | 'í' | 'î' | 'ï' | 'ĩ' | 'ī' | 'į' | 'ı' => "i",
        'ł' | 'ĺ' | 'ľ' | 'ļ' => "l",
        'ñ' | 'ń' | 'ň' | 'ņ' => "n",
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'ō' | 'ő' | 'ŏ' => "o",
        'ø' | 'œ' => "oe",
        'æ' => "ae",
        'ř' | 'ŕ' | 'ŗ' => "r",
        'ś' | 'š' | 'ş' | 'ŝ' | 'ș' => "s",
        'ß' => "ss",
        'ť' | 'ţ' | 'ț' => "t",
        'þ' => "th",
        'ù' | 'ú' | 'û' | 'ü' | 'ū' | 'ŭ' | 'ů' | 'ű' | 'ų' => "u",
        'ý' | 'ÿ' => "y",
        'ž' | 'ź' | 'ż' => "z",
        _ => "",
    }
}

fn contains_words(haystack: &str, needle: &str) -> bool {
    let haystack: Vec<&str> = haystack.split_whitespace().collect();
    let needle: Vec<&str> = needle.split_whitespace().collect();
    !needle.is_empty()
        && needle.len() <= haystack.len()
        && haystack
            .windows(needle.len())
            .any(|window| window == needle.as_slice())
}

fn names_match(area_desc: &str, region: &str) -> bool {
    let area_desc = normalize_name(area_desc);
    let region = normalize_name(region);
    if area_desc.is_empty() || region.is_empty() {
        return false;
    }
    area_desc == region
        || contains_words(&area_desc, &region)
        || contains_words(&region, &area_desc)
}

/// RFC 3339 timestamp to unix seconds.
pub fn parse_iso(s: &str) -> Option<i64> {
    let bytes = s.as_bytes();
    if bytes.len() < 20 || bytes[4] != b'-' || bytes[7] != b'-' {
        return None;
    }
    if bytes[10] != b'T' || bytes[13] != b':' || bytes[16] != b':' {
        return None;
    }

    let year: i64 = s.get(0..4)?.parse().ok()?;
    let month: i64 = s.get(5..7)?.parse().ok()?;
    let day: i64 = s.get(8..10)?.parse().ok()?;
    let hour: i64 = s.get(11..13)?.parse().ok()?;
    let minute: i64 = s.get(14..16)?.parse().ok()?;
    let second: i64 = s.get(17..19)?.parse().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    if hour > 23 || minute > 59 || second > 60 {
        return None;
    }

    let mut idx = 19;
    if bytes.get(idx) == Some(&b'.') {
        idx += 1;
        let start = idx;
        while idx < bytes.len() && bytes[idx].is_ascii_digit() {
            idx += 1;
        }
        if idx == start {
            return None;
        }
    }

    let rest = bytes.get(idx)?;
    let offset_secs: i64 = match rest {
        b'Z' | b'z' => {
            if idx + 1 != bytes.len() {
                return None;
            }
            0
        }
        b'+' | b'-' => {
            let sign = if *rest == b'+' { 1 } else { -1 };
            if idx + 6 != bytes.len() || bytes[idx + 3] != b':' {
                return None;
            }
            let oh: i64 = s.get(idx + 1..idx + 3)?.parse().ok()?;
            let om: i64 = s.get(idx + 4..idx + 6)?.parse().ok()?;
            if oh > 23 || om > 59 {
                return None;
            }
            sign * (oh * 3600 + om * 60)
        }
        _ => return None,
    };

    let days = days_from_civil(year, month, day);
    let secs = days * 86400 + hour * 3600 + minute * 60 + second - offset_secs;
    Some(secs)
}

/// Days since 1970-01-01 for a proleptic Gregorian date.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

#[cfg(test)]
mod tests {
    use super::{
        Alert, Provider, names_match, parse_dwd, parse_eccc, parse_iso, parse_meteoalarm,
        parse_nws, point_in_polygon, provider_for, sort_alerts,
    };

    #[test]
    fn parse_iso_cases() {
        assert_eq!(parse_iso("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(
            parse_iso("2026-11-05T03:00:00-06:00"),
            parse_iso("2026-11-05T09:00:00Z")
        );
        assert!(parse_iso("2026-11-05T06:32:00+00:00").is_some());
        assert_eq!(parse_iso("garbage"), None);
        assert_eq!(parse_iso("2026-11-05T06:32:00"), None);
    }

    #[test]
    fn provider_cases() {
        for c in ["United States", "usa", "  US ", "united states of america"] {
            assert_eq!(provider_for(c), Some(Provider::Nws), "{c}");
        }
        for c in ["Germany", "deutschland", " DE "] {
            assert_eq!(provider_for(c), Some(Provider::Dwd), "{c}");
        }
        for c in ["Canada", "canada", " CA "] {
            assert_eq!(provider_for(c), Some(Provider::Eccc), "{c}");
        }
        for (country, slug) in [
            ("Andorra", "andorra"),
            ("Austria", "austria"),
            ("Belgium", "belgium"),
            ("Bosnia and Herzegovina", "bosnia-and-herzegovina"),
            ("Bulgaria", "bulgaria"),
            ("Croatia", "croatia"),
            ("Cyprus", "cyprus"),
            ("Czechia", "czechia"),
            ("Czech Republic", "czechia"),
            ("Denmark", "denmark"),
            ("Estonia", "estonia"),
            ("Finland", "finland"),
            ("France", "france"),
            ("Greece", "greece"),
            ("Hungary", "hungary"),
            ("Iceland", "iceland"),
            ("Ireland", "ireland"),
            ("Israel", "israel"),
            ("Italy", "italy"),
            ("Latvia", "latvia"),
            ("Lithuania", "lithuania"),
            ("Luxembourg", "luxembourg"),
            ("Malta", "malta"),
            ("Moldova", "moldova"),
            ("Montenegro", "montenegro"),
            ("Netherlands", "netherlands"),
            ("The Netherlands", "netherlands"),
            ("North Macedonia", "republic-of-north-macedonia"),
            ("Republic of North Macedonia", "republic-of-north-macedonia"),
            ("Norway", "norway"),
            ("Poland", "poland"),
            ("Portugal", "portugal"),
            ("Romania", "romania"),
            ("Serbia", "serbia"),
            ("Slovakia", "slovakia"),
            ("Slovenia", "slovenia"),
            ("Spain", "spain"),
            ("Sweden", "sweden"),
            ("Switzerland", "switzerland"),
            ("Ukraine", "ukraine"),
            ("United Kingdom", "united-kingdom"),
            ("UK", "united-kingdom"),
        ] {
            assert_eq!(
                provider_for(country),
                Some(Provider::Meteoalarm(slug)),
                "{country}"
            );
        }
        assert_eq!(provider_for("Australia"), None);
        assert_eq!(provider_for("Japan"), None);
    }

    fn fixture_now() -> i64 {
        parse_iso("2026-11-04T00:00:00Z").unwrap()
    }

    #[test]
    fn parse_meteoalarm_matches_italian_region_names() {
        // The trimmed Italy fixture only contains Green/Minor warnings, so this small
        // sample covers the ordinary name-matching path with Italian region names.
        let json = r#"{"warnings":[{"alert":{
            "identifier":"it-toscana",
            "msgType":"Alert",
            "status":"Actual",
            "info":[
                {
                    "language":"it-IT",
                    "event":"Allerta vento",
                    "severity":"Moderate",
                    "expires":"2026-11-06T23:59:00+01:00",
                    "area":[{"areaDesc":"Toscana"}]
                },
                {
                    "language":"en-GB",
                    "event":"Wind warning",
                    "headline":"Wind warning for Toscana",
                    "severity":"Moderate",
                    "expires":"2026-11-06T23:59:00+01:00",
                    "senderName":"Italian Air Force National Meteorological Service",
                    "area":[{"areaDesc":"Toscana"}]
                }
            ]
        }}]}"#;
        let now = fixture_now();
        let matched = parse_meteoalarm(
            json,
            43.0,
            11.0,
            &["Toscana".to_string()],
            now,
        );
        assert_eq!(matched.len(), 1);
        assert_eq!(matched[0].id, "meteoalarm:it-toscana");
        assert_eq!(matched[0].event, "Wind warning");
        assert_eq!(matched[0].headline, "Wind warning for Toscana");
        assert_eq!(matched[0].severity, "moderate");
        assert_eq!(matched[0].source, "Meteoalarm");
        assert_eq!(
            matched[0].sender,
            "Italian Air Force National Meteorological Service"
        );

        let other = parse_meteoalarm(
            json,
            43.0,
            11.0,
            &["Lombardia".to_string()],
            now,
        );
        assert!(other.is_empty());
    }

    #[test]
    fn parse_meteoalarm_italy_fixture_is_all_green() {
        // The trimmed fixture happens to contain only Green/Minor warnings, so all are dropped.
        let json = include_str!("../fixtures/meteoalarm_italy.json");
        let alerts = parse_meteoalarm(
            json,
            42.0,
            12.0,
            &["Toscana".to_string(), "Sardegna".to_string()],
            fixture_now(),
        );
        assert!(alerts.is_empty());
    }

    #[test]
    fn parse_meteoalarm_norway_fixture_matches_polygon() {
        let json = include_str!("../fixtures/meteoalarm_norway.json");
        let inside = parse_meteoalarm(json, 63.9, 9.2, &[], fixture_now());
        let alert = inside
            .iter()
            .find(|a| a.id == "meteoalarm:2.49.0.1.578.0.20261104031829.025")
            .expect("point should be inside the Froeya - Halten polygon");
        assert_eq!(alert.event, "Gale");
        assert_eq!(alert.severity, "moderate");
        assert_eq!(alert.source, "Meteoalarm");
        assert_eq!(alert.sender, "MET Norway");

        let far = parse_meteoalarm(json, 40.0, -3.0, &[], fixture_now());
        assert!(far.is_empty());
    }

    #[test]
    fn parse_meteoalarm_drops_expired_norway_warning() {
        let json = include_str!("../fixtures/meteoalarm_norway.json");
        // The Froeya - Halten warning ends at 20:00Z.
        let now = parse_iso("2026-11-04T21:00:00Z").unwrap();
        let alerts = parse_meteoalarm(json, 63.9, 9.2, &[], now);
        assert!(alerts.is_empty(), "{alerts:?}");
    }

    #[test]
    fn parse_meteoalarm_spain_fixture_matches_zone_name() {
        let json = include_str!("../fixtures/meteoalarm_spain.json");
        let alerts = parse_meteoalarm(
            json,
            39.5,
            -0.4,
            &["Litoral sur de Valencia".to_string()],
            fixture_now(),
        );
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].event, "Moderate rain warning");
        assert_eq!(alerts[0].severity, "moderate");
        assert_eq!(alerts[0].sender, "AEMET. State Meteorological Agency");
        assert_eq!(alerts[0].source, "Meteoalarm");

        let other = parse_meteoalarm(
            json,
            39.5,
            -0.4,
            &["Lombardia".to_string()],
            fixture_now(),
        );
        assert!(other.is_empty());
    }

    #[test]
    fn parse_meteoalarm_austria_fixture_is_empty() {
        let json = include_str!("../fixtures/meteoalarm_austria.json");
        assert!(parse_meteoalarm(json, 48.2, 16.4, &["Wien".to_string()], fixture_now()).is_empty());
    }

    #[test]
    fn parse_meteoalarm_drops_green_minor_and_non_actual() {
        let json = r#"{"warnings":[
            {"alert":{"identifier":"green","msgType":"Alert","status":"Actual","info":[
                {"language":"en","event":"Green Wind Warning","severity":"Moderate","expires":"2026-11-06T00:00:00Z","area":[{"areaDesc":"Toscana"}]}
            ]}},
            {"alert":{"identifier":"minor","msgType":"Alert","status":"Actual","info":[
                {"language":"en","event":"Wind warning","severity":"Minor","expires":"2026-11-06T00:00:00Z","area":[{"areaDesc":"Toscana"}]}
            ]}},
            {"alert":{"identifier":"exercise","msgType":"Alert","status":"Exercise","info":[
                {"language":"en","event":"Wind warning","severity":"Moderate","expires":"2026-11-06T00:00:00Z","area":[{"areaDesc":"Toscana"}]}
            ]}},
            {"alert":{"identifier":"cancel","msgType":"Cancel","status":"Actual","info":[
                {"language":"en","event":"Wind warning","severity":"Moderate","expires":"2026-11-06T00:00:00Z","area":[{"areaDesc":"Toscana"}]}
            ]}},
            {"alert":{"identifier":"expired","msgType":"Alert","status":"Actual","info":[
                {"language":"en","event":"Wind warning","severity":"Moderate","expires":"2026-11-03T00:00:00Z","area":[{"areaDesc":"Toscana"}]}
            ]}},
            {"alert":{"identifier":"ok","msgType":"Alert","status":"Actual","info":[
                {"language":"en","event":"Wind warning","severity":"Severe","expires":"2026-11-06T00:00:00Z","area":[{"areaDesc":"Toscana"}]}
            ]}}
        ]}"#;
        let alerts = parse_meteoalarm(json, 43.0, 11.0, &["Toscana".to_string()], fixture_now());
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].id, "meteoalarm:ok");
        assert_eq!(alerts[0].severity, "severe");
    }

    #[test]
    fn point_in_polygon_cases() {
        let square = [(0.0, 0.0), (0.0, 1.0), (1.0, 1.0), (1.0, 0.0)];
        assert!(point_in_polygon(0.5, 0.5, &square));
        assert!(!point_in_polygon(2.0, 2.0, &square));
        assert!(!point_in_polygon(0.5, 1.5, &square));
        assert!(!point_in_polygon(0.5, 0.5, &[]));
    }

    #[test]
    fn names_match_handles_accents_and_whole_words() {
        assert!(names_match("Litoral sur de Valencia", "Valencia"));
        assert!(names_match("Côte d'Azur", "Cote d Azur"));
        assert!(names_match("Frøya - Halten", "Froeya"));
        assert!(names_match("Toscana", "toscana"));
        assert!(!names_match("Toscana", "Lombardia"));
    }

    #[test]
    fn parse_nws_fixture() {
        let json = include_str!("../fixtures/nws_alerts.json");
        let alerts = parse_nws(json);
        assert_eq!(alerts.len(), 1);
        let a = &alerts[0];
        assert!(a.id.starts_with("nws:"));
        assert_eq!(a.severity, "moderate");
        assert_eq!(a.event, "Dense Fog Advisory");
        assert!(a.instruction.is_some());
        assert_eq!(a.sender, "NWS Shreveport LA");
        assert_eq!(a.source, "NWS");
    }

    #[test]
    fn parse_nws_drops_exercises_and_falls_back_headline() {
        let json = r#"{"features":[
            {"properties":{"id":"ex","event":"Exercise","status":"Exercise","messageType":"Alert"}},
            {"properties":{"id":"ex2","event":"Test","status":"Actual","messageType":"Cancel"}},
            {"properties":{"id":"ok","event":"Frost Advisory","status":"Actual","messageType":"Alert","headline":null}}
        ]}"#;
        let alerts = parse_nws(json);
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].headline, "Frost Advisory");
    }

    fn eccc_first_point(value: &serde_json::Value) -> (f64, f64) {
        let ring = value["features"][0]["geometry"]["coordinates"][0]
            .as_array()
            .expect("first polygon ring");
        let mut latitude = 0.0;
        let mut longitude = 0.0;
        for point in ring {
            longitude += point[0].as_f64().unwrap();
            latitude += point[1].as_f64().unwrap();
        }
        let count = ring.len() as f64;
        (latitude / count, longitude / count)
    }

    #[test]
    fn parse_eccc_fixture_matches_first_polygon() {
        let json = include_str!("../fixtures/eccc_alerts.json");
        let value: serde_json::Value = serde_json::from_str(json).unwrap();
        let (latitude, longitude) = eccc_first_point(&value);
        let first_end = value["features"][0]["properties"]["expiration_datetime"]
            .as_str()
            .and_then(parse_iso)
            .expect("first feature expiry");
        let alerts = parse_eccc(json, latitude, longitude, first_end - 1);
        let alert = alerts
            .iter()
            .find(|a| a.event == "Special weather statement")
            .expect("the vertex average should be inside the first polygon");
        assert!(alert.id.starts_with("eccc:SPS"));
        assert_eq!(alert.severity, "minor");
        let props = &value["features"][0]["properties"];
        assert_eq!(
            alert.headline,
            props["feature_name_en"].as_str().unwrap_or_default().trim()
        );
        assert_eq!(
            alert.description,
            props["alert_text_en"].as_str().unwrap_or_default()
        );
        assert_eq!(alert.ends, Some(first_end));
        assert_eq!(alert.sender, "Environment and Climate Change Canada");
        assert_eq!(alert.source, "Environment and Climate Change Canada");

        let far = parse_eccc(json, 0.0, 0.0, first_end - 1);
        assert!(far.is_empty());
    }

    #[test]
    fn parse_eccc_fixture_drops_expired() {
        let json = include_str!("../fixtures/eccc_alerts.json");
        let value: serde_json::Value = serde_json::from_str(json).unwrap();
        let (latitude, longitude) = eccc_first_point(&value);
        let now = value["features"]
            .as_array()
            .expect("fixture features")
            .iter()
            .filter_map(|f| f["properties"]["expiration_datetime"].as_str())
            .filter_map(parse_iso)
            .max()
            .expect("fixture expiries");
        assert!(parse_eccc(json, latitude, longitude, now + 1).is_empty());
    }

    #[test]
    fn parse_eccc_handles_multipolygon_and_dedupes() {
        let json = r#"{"features":[
            {"geometry":{"type":"MultiPolygon","coordinates":[[[[-1.0,0.0],[1.0,0.0],[1.0,2.0],[-1.0,2.0],[-1.0,0.0]]]]},
             "properties":{"alert_code":"W","alert_name_en":"wind warning","alert_type":"warning","risk_colour_en":"red","feature_name_en":"Test area","alert_text_en":"Text","expiration_datetime":"2030-01-01T00:00:00Z"}},
            {"geometry":{"type":"Polygon","coordinates":[[[-1.0,0.0],[1.0,0.0],[1.0,2.0],[-1.0,2.0],[-1.0,0.0]]]},
             "properties":{"alert_code":"W","alert_name_en":"wind warning","alert_type":"warning","feature_name_en":"Test area","alert_text_en":"Text","expiration_datetime":"2030-01-01T00:00:00Z"}}
        ]}"#;
        let alerts = parse_eccc(json, 1.0, 0.5, 0);
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].event, "Wind warning");
        assert_eq!(alerts[0].severity, "extreme");
        assert_eq!(alerts[0].description, "Text");
    }

    #[test]
    fn parse_dwd_fixture() {
        let json = include_str!("../fixtures/brightsky_alerts.json");
        let alerts = parse_dwd(json);
        assert_eq!(alerts.len(), 2);
        for a in &alerts {
            assert!(a.id.starts_with("dwd:"));
            assert_eq!(a.severity, "minor");
            assert_eq!(a.source, "DWD");
        }
        assert_eq!(alerts[0].event, "Fog");
    }

    fn alert(id: &str, severity: &str, onset: Option<i64>) -> Alert {
        Alert {
            id: id.to_string(),
            event: String::new(),
            severity: severity.to_string(),
            headline: String::new(),
            description: String::new(),
            instruction: None,
            onset,
            ends: None,
            sender: String::new(),
            source: String::new(),
        }
    }

    #[test]
    fn sort_orders_severity_then_onset() {
        let mut alerts = vec![
            alert("minor", "minor", Some(1)),
            alert("extreme", "extreme", Some(100)),
            alert("moderate-late", "moderate", Some(50)),
            alert("moderate-early", "moderate", Some(10)),
        ];
        sort_alerts(&mut alerts);
        let ids: Vec<&str> = alerts.iter().map(|a| a.id.as_str()).collect();
        assert_eq!(ids, vec!["extreme", "moderate-early", "moderate-late", "minor"]);
    }
}
