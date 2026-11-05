use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, State};

use crate::store;
use crate::tray;
use crate::weather::{self, Location, WeatherBundle};

const CACHE_TTL_SECS: i64 = 600;
const CURRENT_FILE: &str = "current.json";

/// When set, closing the window only hides it, so it reopens instantly (the webview stays in memory).
pub static KEEP_ALIVE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[tauri::command]
pub fn set_keep_alive(on: bool) {
    KEEP_ALIVE.store(on, std::sync::atomic::Ordering::Relaxed);
}

/// When set, new moderate-or-worse alerts for the current location raise a system notification.
pub static ALERT_NOTIFICATIONS: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[tauri::command]
pub fn set_alert_notifications(on: bool) {
    ALERT_NOTIFICATIONS.store(on, std::sync::atomic::Ordering::Relaxed);
}

pub struct Http(pub reqwest::Client);

impl Http {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .user_agent("skylark/0.1")
            .build()
            .unwrap_or_default();
        Http(client)
    }
}

impl Default for Http {
    fn default() -> Self {
        Self::new()
    }
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub(crate) fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_cache_dir().map_err(|e| e.to_string())
}

pub(crate) fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_city(http: State<'_, Http>, query: String) -> Result<Vec<Location>, String> {
    let query = query.trim().to_string();
    if query.chars().count() < 2 {
        return Ok(Vec::new());
    }
    weather::search(&http.0, &query).await
}

#[tauri::command]
pub async fn locate_ip(http: State<'_, Http>) -> Result<Location, String> {
    weather::locate_ip(&http.0).await
}

#[tauri::command]
pub async fn get_cached(app: AppHandle, location: Location) -> Option<WeatherBundle> {
    let dir = cache_dir(&app).ok()?;
    store::read_cache(&dir, &location)
}

#[tauri::command]
pub async fn get_weather(
    app: AppHandle,
    http: State<'_, Http>,
    location: Location,
    force: bool,
) -> Result<WeatherBundle, String> {
    let cached = get_cached(app.clone(), location.clone()).await;

    if !force
        && let Some(bundle) = &cached
        && now_secs() - bundle.fetched_at < CACHE_TTL_SECS
    {
        return Ok(bundle.clone());
    }

    match weather::fetch_bundle(&http.0, &location).await {
        Ok(bundle) => {
            if let Ok(dir) = cache_dir(&app) {
                store::write_cache(&dir, &bundle);
            }
            Ok(bundle)
        }
        Err(e) => match cached {
            Some(mut bundle) => {
                bundle.stale = true;
                Ok(bundle)
            }
            None => Err(e),
        },
    }
}

#[tauri::command]
pub fn get_saved(app: AppHandle) -> Vec<Location> {
    data_dir(&app)
        .map(|dir| store::read_saved(&dir))
        .unwrap_or_default()
}

fn same_place(a: &Location, lat: f64, lon: f64) -> bool {
    (a.latitude * 100.0).round() == (lat * 100.0).round()
        && (a.longitude * 100.0).round() == (lon * 100.0).round()
}

#[tauri::command]
pub fn save_location(app: AppHandle, location: Location) -> Result<Vec<Location>, String> {
    let dir = data_dir(&app)?;
    let mut list = store::read_saved(&dir);
    if !list
        .iter()
        .any(|l| same_place(l, location.latitude, location.longitude))
    {
        list.push(location);
        store::write_saved(&dir, &list)?;
    }
    Ok(list)
}

#[tauri::command]
pub fn remove_location(
    app: AppHandle,
    latitude: f64,
    longitude: f64,
) -> Result<Vec<Location>, String> {
    let dir = data_dir(&app)?;
    let mut list = store::read_saved(&dir);
    list.retain(|l| !same_place(l, latitude, longitude));
    store::write_saved(&dir, &list)?;
    Ok(list)
}

#[tauri::command]
pub fn set_current_location(app: AppHandle, location: Location) -> Result<(), String> {
    let dir = data_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string(&location).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(CURRENT_FILE), text).map_err(|e| e.to_string())?;
    tray::refresh_now(&app);
    Ok(())
}

pub fn read_current_location(app: &AppHandle) -> Option<Location> {
    let dir = data_dir(app).ok()?;
    if let Ok(text) = std::fs::read_to_string(dir.join(CURRENT_FILE))
        && let Ok(loc) = serde_json::from_str::<Location>(&text)
    {
        return Some(loc);
    }
    store::read_saved(&dir).into_iter().next()
}

#[cfg(test)]
mod tests {
    use super::same_place;
    use crate::weather::Location;

    #[test]
    fn dedupes_on_rounded_coords() {
        let loc = Location {
            name: "London".into(),
            country: "United Kingdom".into(),
            admin1: None,
            latitude: 51.50853,
            longitude: -0.12574,
        };
        assert!(same_place(&loc, 51.5084, -0.1256));
        assert!(!same_place(&loc, 51.52, -0.12574));
    }
}
