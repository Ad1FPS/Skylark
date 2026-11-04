use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::commands::{self, Http};

const ARCHIVE_URL: &str = "https://archive-api.open-meteo.com/v1/archive";
const CACHE_TTL_SECS: i64 = 90 * 24 * 3600;
const YEARS: i32 = 10;

/// Month lengths with February fixed at 29 days so the profile is year-agnostic.
const MONTH_LEN: [usize; 12] = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClimateProfile {
    fetched_at: i64,
    avg_high: Vec<f32>,
}

#[derive(Deserialize)]
struct ArchiveResponse {
    daily: Option<ArchiveDaily>,
}

#[derive(Deserialize)]
struct ArchiveDaily {
    time: Vec<String>,
    #[serde(default)]
    temperature_2m_max: Vec<Option<f32>>,
}

fn cache_path(app: &AppHandle, lat: f64, lon: f64) -> Option<PathBuf> {
    let dir = commands::data_dir(app).ok()?;
    Some(dir.join(format!("climate_{lat:.2}_{lon:.2}.json")))
}

fn read_cache(path: &PathBuf) -> Option<ClimateProfile> {
    let text = std::fs::read_to_string(path).ok()?;
    let profile: ClimateProfile = serde_json::from_str(&text).ok()?;
    if profile.avg_high.len() != 366 {
        return None;
    }
    Some(profile)
}

fn write_cache(path: &PathBuf, profile: &ClimateProfile) {
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(text) = serde_json::to_string(profile) {
        let _ = std::fs::write(path, text);
    }
}

async fn fetch_profile(
    http: &reqwest::Client,
    latitude: f64,
    longitude: f64,
    year: i32,
) -> Option<Vec<f32>> {
    let start = format!("{}-01-01", year - YEARS);
    let end = format!("{}-12-31", year - 1);
    let url = format!(
        "{ARCHIVE_URL}?latitude={latitude}&longitude={longitude}&start_date={start}&end_date={end}&daily=temperature_2m_max&timezone=auto"
    );
    let res = http.get(url).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    let body: ArchiveResponse = res.json().await.ok()?;
    let daily = body.daily?;
    Some(build_profile(&daily.time, &daily.temperature_2m_max))
}

#[tauri::command]
pub async fn get_normal(
    app: AppHandle,
    http: State<'_, Http>,
    latitude: f64,
    longitude: f64,
    date: String,
) -> Result<Option<f32>, String> {
    let index = match day_index(&date) {
        Some(i) => i,
        None => return Ok(None),
    };
    let year: i32 = match date.get(0..4).and_then(|y| y.parse().ok()) {
        Some(y) => y,
        None => return Ok(None),
    };

    let path = cache_path(&app, latitude, longitude);

    if let Some(path) = &path
        && let Some(profile) = read_cache(path)
        && now_secs() - profile.fetched_at < CACHE_TTL_SECS
    {
        let v = profile.avg_high[index];
        return Ok(if v.is_finite() { Some(v) } else { None });
    }

    let values = match fetch_profile(&http.0, latitude, longitude, year).await {
        Some(v) => v,
        None => return Ok(None),
    };

    if let Some(path) = &path {
        write_cache(
            path,
            &ClimateProfile {
                fetched_at: now_secs(),
                avg_high: values.clone(),
            },
        );
    }

    let v = values[index];
    Ok(if v.is_finite() { Some(v) } else { None })
}

/// Index into the 366-day table (Jan 1 = 0, Feb 29 = 59, Mar 1 = 60).
fn day_index(date: &str) -> Option<usize> {
    let mut parts = date.split('-');
    let _year: i32 = parts.next()?.parse().ok()?;
    let month: usize = parts.next()?.parse().ok()?;
    let day: usize = parts.next()?.parse().ok()?;
    if parts.next().is_some() || !(1..=12).contains(&month) {
        return None;
    }
    let max = MONTH_LEN[month - 1];
    if day < 1 || day > max {
        return None;
    }
    let offset: usize = MONTH_LEN[..month - 1].iter().sum();
    Some(offset + day - 1)
}

/// Averages every calendar day over the years, then smooths with a +-3 day mean.
fn build_profile(times: &[String], values: &[Option<f32>]) -> Vec<f32> {
    let mut sums = [0.0f64; 366];
    let mut counts = [0u32; 366];

    for (t, v) in times.iter().zip(values.iter()) {
        let Some(v) = v else { continue };
        let Some(idx) = day_index(t) else { continue };
        sums[idx] += *v as f64;
        counts[idx] += 1;
    }

    let mut avg = [f32::NAN; 366];
    for i in 0..366 {
        if counts[i] > 0 {
            avg[i] = (sums[i] / counts[i] as f64) as f32;
        }
    }

    let mut out = vec![f32::NAN; 366];
    for (i, slot) in out.iter_mut().enumerate() {
        let mut total = 0.0f64;
        let mut n = 0u32;
        for k in -3i32..=3 {
            let j = (i as i32 + k).rem_euclid(366) as usize;
            if avg[j].is_finite() {
                total += avg[j] as f64;
                n += 1;
            }
        }
        if n > 0 {
            *slot = (total / n as f64) as f32;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::{build_profile, day_index};

    #[test]
    fn day_index_cases() {
        assert_eq!(day_index("2026-11-04"), Some(308));
        assert_eq!(day_index("2024-02-29"), Some(59));
        assert_eq!(day_index("2025-03-01"), Some(60));
        assert_eq!(day_index("2025-12-31"), Some(365));
        assert_eq!(day_index("2025-01-01"), Some(0));
        assert_eq!(day_index("garbage"), None);
        assert_eq!(day_index("2025-13-01"), None);
        assert_eq!(day_index("2025-02-30"), None);
        assert_eq!(day_index("2025-04"), None);
    }

    fn daily_series(
        start_year: i32,
        end_year: i32,
        f: impl Fn(i32, u32) -> Option<f32>,
    ) -> (Vec<String>, Vec<Option<f32>>) {
        let month_len = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        let mut times = Vec::new();
        let mut values = Vec::new();
        for y in start_year..=end_year {
            for (m, &len) in month_len.iter().enumerate() {
                for d in 1..=len {
                    times.push(format!("{y}-{:02}-{:02}", m + 1, d));
                    values.push(f(y, d));
                }
            }
        }
        (times, values)
    }

    #[test]
    fn constant_series_gives_constant_profile() {
        let (times, values) = daily_series(2016, 2018, |_, _| Some(10.0));
        let profile = build_profile(&times, &values);
        assert_eq!(profile.len(), 366);
        for v in &profile {
            assert!((v - 10.0).abs() < 1e-4, "expected 10.0, got {v}");
        }
    }

    #[test]
    fn nulls_are_skipped() {
        let (times, values) = daily_series(2016, 2018, |y, d| {
            if y == 2017 && d % 2 == 0 { None } else { Some(10.0) }
        });
        let profile = build_profile(&times, &values);
        for v in &profile {
            assert!((v - 10.0).abs() < 1e-4, "expected 10.0, got {v}");
        }
    }

    #[test]
    fn spike_is_smoothed() {
        // Jan 1 (index 0) spikes to 30, everything else 10.
        let (times, values) = daily_series(2016, 2018, |_, d| {
            Some(if d == 1 { 30.0 } else { 10.0 })
        });
        let profile = build_profile(&times, &values);
        // Every year spikes on Jan 1, so the average is 30; the 7-day smoothing leaves 10 + 20/7.
        assert!((profile[0] - 12.857).abs() < 0.01, "got {}", profile[0]);
        // Neighbours inside +-3 days pick up part of the excess, far days do not.
        assert!(profile[1] > 10.0);
        assert!(profile[3] > 10.0);
        assert!((profile[4] - 10.0).abs() < 1e-4);
        assert!((profile[10] - 10.0).abs() < 1e-4);
        // Circular: the week below the year boundary also sees it.
        assert!(profile[365] > 10.0);
    }
}
