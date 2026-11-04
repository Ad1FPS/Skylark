use std::fs;
use std::path::Path;

use crate::weather::{Location, WeatherBundle};

const SAVED: &str = "saved.json";

pub fn cache_key(loc: &Location) -> String {
    format!("{:.2}_{:.2}.json", loc.latitude, loc.longitude)
}

pub fn read_cache(dir: &Path, loc: &Location) -> Option<WeatherBundle> {
    let text = fs::read_to_string(dir.join(cache_key(loc))).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn write_cache(dir: &Path, bundle: &WeatherBundle) {
    let _ = fs::create_dir_all(dir);
    let Ok(text) = serde_json::to_string(bundle) else {
        return;
    };
    let key = cache_key(&bundle.location);
    let tmp = dir.join(format!("{key}.tmp"));
    if fs::write(&tmp, text).is_ok() {
        let _ = fs::rename(&tmp, dir.join(key));
    }
}

pub fn read_saved(dir: &Path) -> Vec<Location> {
    fs::read_to_string(dir.join(SAVED))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

pub fn write_saved(dir: &Path, list: &[Location]) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string(list).map_err(|e| e.to_string())?;
    fs::write(dir.join(SAVED), text).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::weather::{Air, Current, Day, Hour};
    use std::path::PathBuf;

    fn unique_dir(tag: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("weatherapp_test_{tag}_{nanos}"))
    }

    fn sample() -> WeatherBundle {
        WeatherBundle {
            location: Location {
                name: "London".into(),
                country: "United Kingdom".into(),
                admin1: Some("England".into()),
                latitude: 51.50853,
                longitude: -0.12574,
            },
            fetched_at: 1_700_000_000,
            stale: false,
            timezone: "Europe/London".into(),
            utc_offset_seconds: 0,
            current: Current {
                time: "2026-11-03T18:00".into(),
                temperature: 10.7,
                apparent: 7.9,
                humidity: 79,
                is_day: false,
                weather_code: 3,
                wind_speed: 14.0,
                wind_direction: 38,
                pressure: 1031.0,
                visibility: 19240.0,
                uv_index: 0.0,
                precipitation: 0.0,
            },
            hourly: vec![Hour {
                time: "2026-11-03T18:00".into(),
                temperature: 10.7,
                weather_code: 3,
                precipitation_probability: Some(0),
                is_day: false,
            }],
            daily: vec![Day {
                date: "2026-11-03".into(),
                weather_code: 51,
                temp_max: 12.1,
                temp_min: 8.4,
                precipitation_probability_max: Some(20),
                precipitation_sum: 0.8,
                uv_index_max: 0.8,
                sunrise: "2026-11-03T06:57".into(),
                sunset: "2026-11-03T16:30".into(),
                ..Default::default()
            }],
            air: Some(Air {
                us_aqi: 26,
                pm2_5: 4.8,
                ..Default::default()
            }),
            minutely: Vec::new(),
            detail: Default::default(),
        }
    }

    #[test]
    fn cache_roundtrip() {
        let dir = unique_dir("cache");
        let bundle = sample();
        write_cache(&dir, &bundle);
        let read = read_cache(&dir, &bundle.location).expect("cache present");
        assert_eq!(read.fetched_at, bundle.fetched_at);
        assert_eq!(read.current.temperature, bundle.current.temperature);
        assert_eq!(read.hourly.len(), 1);
        assert_eq!(read.daily.len(), 1);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn saved_roundtrip() {
        let dir = unique_dir("saved");
        let list = vec![sample().location];
        write_saved(&dir, &list).expect("write");
        let read = read_saved(&dir);
        assert_eq!(read.len(), 1);
        assert_eq!(read[0].name, "London");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn saved_missing_is_empty() {
        assert!(read_saved(&unique_dir("missing")).is_empty());
    }
}
