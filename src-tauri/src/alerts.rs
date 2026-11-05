use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::Http;
use crate::weather::Location;

const NWS_URL: &str = "https://api.weather.gov/alerts/active";
const NWS_USER_AGENT: &str = "(Skylark weather app, https://github.com/Ad1FPS/Skylark)";
const BRIGHTSKY_URL: &str = "https://api.brightsky.dev/alerts";
const CACHE_TTL_SECS: i64 = 300;
const DWD_SENDER: &str = "Deutscher Wetterdienst";

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

#[derive(Default)]
pub struct AlertCache(Mutex<std::collections::HashMap<String, (i64, Vec<Alert>)>>);

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Provider {
    Nws,
    Dwd,
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn provider_for(country: &str) -> Option<Provider> {
    let c = country.trim();
    if ["United States", "United States of America", "USA", "US"]
        .iter()
        .any(|s| s.eq_ignore_ascii_case(c))
    {
        Some(Provider::Nws)
    } else if ["Germany", "Deutschland", "DE"]
        .iter()
        .any(|s| s.eq_ignore_ascii_case(c))
    {
        Some(Provider::Dwd)
    } else {
        None
    }
}

#[tauri::command]
pub async fn get_alerts(
    http: State<'_, Http>,
    cache: State<'_, AlertCache>,
    location: Location,
) -> Result<Vec<Alert>, String> {
    alerts_for(&http.0, &cache, &location).await
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

    let cached = cache.0.lock().ok().and_then(|map| map.get(&key).cloned());
    if let Some((fetched_at, alerts)) = &cached
        && now - fetched_at < CACHE_TTL_SECS
    {
        return Ok(alerts.clone());
    }

    let fetched = match provider {
        Provider::Nws => fetch_nws(http, location.latitude, location.longitude).await,
        Provider::Dwd => fetch_dwd(http, location.latitude, location.longitude).await,
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

    if let Ok(mut map) = cache.0.lock() {
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
        .header("User-Agent", NWS_USER_AGENT)
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
        Alert, Provider, parse_dwd, parse_iso, parse_nws, provider_for, sort_alerts,
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
        assert_eq!(provider_for("France"), None);
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
