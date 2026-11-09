use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Deserialize;

use crate::alerts::APP_USER_AGENT;
use crate::weather::Location;

const NOMINATIM_URL: &str = "https://nominatim.openstreetmap.org/reverse";
const REGIONS_FILE: &str = "regions.json";

/// Nominatim asks for at most one request per second and for a real User-Agent.
const NOMINATIM_INTERVAL: Duration = Duration::from_secs(1);

/// The app data directory, set by the command layer once a Tauri handle is available.
static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();
static FILE_LOCK: Mutex<()> = Mutex::new(());
static REQUEST_GATE: Mutex<Option<Instant>> = Mutex::new(None);

pub fn set_data_dir(dir: PathBuf) {
    let _ = DATA_DIR.set(dir);
}

fn key(latitude: f64, longitude: f64) -> String {
    format!("{latitude:.3},{longitude:.3}")
}

fn cache_path() -> Option<PathBuf> {
    DATA_DIR.get().map(|dir| dir.join(REGIONS_FILE))
}

fn read_cached(key: &str) -> Option<Vec<String>> {
    let _guard = FILE_LOCK.lock().ok()?;
    let text = std::fs::read_to_string(cache_path()?).ok()?;
    let map: HashMap<String, Vec<String>> = serde_json::from_str(&text).ok()?;
    map.get(key).cloned()
}

fn write_cached(key: &str, names: &[String]) {
    let Some(path) = cache_path() else {
        return;
    };
    let Ok(_guard) = FILE_LOCK.lock() else {
        return;
    };
    let mut map: HashMap<String, Vec<String>> = std::fs::read_to_string(&path)
        .ok()
        .and_then(|text| serde_json::from_str::<HashMap<String, Vec<String>>>(&text).ok())
        .unwrap_or_default();
    map.insert(key.to_string(), names.to_vec());
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(text) = serde_json::to_string(&map) {
        let _ = std::fs::write(&path, text);
    }
}

/// Nominatim policy: at most one request per second, and spread out concurrent lookups.
fn wait_for_turn() {
    let wait = match REQUEST_GATE.lock() {
        Ok(mut last) => {
            let now = Instant::now();
            let start = match *last {
                Some(previous) if previous + NOMINATIM_INTERVAL > now => {
                    previous + NOMINATIM_INTERVAL
                }
                _ => now,
            };
            *last = Some(start);
            start.saturating_duration_since(now)
        }
        Err(_) => Duration::ZERO,
    };
    if !wait.is_zero() {
        std::thread::sleep(wait);
    }
}

#[derive(Deserialize)]
struct ReverseResponse {
    address: Option<HashMap<String, String>>,
    namedetails: Option<HashMap<String, String>>,
}

fn push_unique(names: &mut Vec<String>, value: &str) {
    let value = value.trim();
    if value.is_empty() {
        return;
    }
    if !names
        .iter()
        .any(|existing| existing.eq_ignore_ascii_case(value))
    {
        names.push(value.to_string());
    }
}

fn collect(response: ReverseResponse, names: &mut Vec<String>) {
    if let Some(address) = response.address {
        for field in [
            "state",
            "state_district",
            "county",
            "region",
            "province",
            "municipality",
            "city",
        ] {
            if let Some(value) = address.get(field) {
                push_unique(names, value);
            }
        }
    }
    if let Some(details) = response.namedetails {
        for value in details.values() {
            push_unique(names, value);
        }
    }
}

/// Region names for a location: its admin area plus the local names Nominatim knows.
/// Successful lookups are cached forever in `regions.json`; failures fall back to admin1 + name.
pub async fn region_names(http: &reqwest::Client, location: &Location) -> Vec<String> {
    let mut names = Vec::new();
    if let Some(admin1) = location.admin1.as_deref() {
        push_unique(&mut names, admin1);
    }

    let cache_key = key(location.latitude, location.longitude);
    if let Some(cached) = read_cached(&cache_key) {
        for name in &cached {
            push_unique(&mut names, name);
        }
        return names;
    }

    // Meteoalarm uses local-language names, so no accept-language header here.
    let url = format!(
        "{NOMINATIM_URL}?format=jsonv2&lat={:.5}&lon={:.5}&zoom=10&namedetails=1",
        location.latitude, location.longitude
    );
    wait_for_turn();
    let response = match http
        .get(url)
        .header("User-Agent", APP_USER_AGENT)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => res.json::<ReverseResponse>().await.ok(),
        _ => None,
    };

    let mut found = Vec::new();
    if let Some(response) = response {
        collect(response, &mut found);
    }

    if found.is_empty() {
        // A failed or empty lookup is not cached, so it can be retried later.
        push_unique(&mut names, location.name.as_str());
    } else {
        write_cached(&cache_key, &found);
        for name in &found {
            push_unique(&mut names, name);
        }
    }

    names
}
