use serde::{Deserialize, Serialize};

const FORECAST_URL: &str = "https://api.open-meteo.com/v1/forecast";
const AIR_URL: &str = "https://air-quality-api.open-meteo.com/v1/air-quality";
const GEOCODE_URL: &str = "https://geocoding-api.open-meteo.com/v1/search";

const CURRENT_FIELDS: &str = "temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl,visibility,uv_index,precipitation";
const HOURLY_FIELDS: &str = "temperature_2m,weather_code,precipitation_probability,is_day";
const DAILY_FIELDS: &str = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,sunrise,sunset";

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Location {
    pub name: String,
    pub country: String,
    pub admin1: Option<String>,
    pub latitude: f64,
    pub longitude: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WeatherBundle {
    pub location: Location,
    pub fetched_at: i64,
    pub stale: bool,
    pub timezone: String,
    pub utc_offset_seconds: i32,
    pub current: Current,
    pub hourly: Vec<Hour>,
    pub daily: Vec<Day>,
    pub air: Option<Air>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Current {
    pub time: String,
    pub temperature: f32,
    pub apparent: f32,
    pub humidity: u8,
    pub is_day: bool,
    pub weather_code: u8,
    pub wind_speed: f32,
    pub wind_direction: u16,
    pub pressure: f32,
    pub visibility: f32,
    pub uv_index: f32,
    pub precipitation: f32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Hour {
    pub time: String,
    pub temperature: f32,
    pub weather_code: u8,
    pub precipitation_probability: Option<u8>,
    pub is_day: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Day {
    pub date: String,
    pub weather_code: u8,
    pub temp_max: f32,
    pub temp_min: f32,
    pub precipitation_probability_max: Option<u8>,
    pub precipitation_sum: f32,
    pub uv_index_max: f32,
    pub sunrise: String,
    pub sunset: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Air {
    pub us_aqi: u16,
    pub pm2_5: f32,
}

// --- raw API shapes ---

#[derive(Deserialize)]
struct RawForecast {
    #[serde(default)]
    utc_offset_seconds: i32,
    #[serde(default)]
    timezone: String,
    current: Option<RawCurrent>,
    #[serde(default)]
    hourly: Option<RawHourly>,
    #[serde(default)]
    daily: Option<RawDaily>,
}

#[derive(Deserialize)]
struct RawCurrent {
    #[serde(default)]
    time: String,
    #[serde(default)]
    temperature_2m: Option<f32>,
    #[serde(default)]
    apparent_temperature: Option<f32>,
    #[serde(default)]
    relative_humidity_2m: Option<f32>,
    #[serde(default)]
    is_day: Option<u8>,
    #[serde(default)]
    weather_code: Option<u8>,
    #[serde(default)]
    wind_speed_10m: Option<f32>,
    #[serde(default)]
    wind_direction_10m: Option<f32>,
    #[serde(default)]
    pressure_msl: Option<f32>,
    #[serde(default)]
    visibility: Option<f32>,
    #[serde(default)]
    uv_index: Option<f32>,
    #[serde(default)]
    precipitation: Option<f32>,
}

#[derive(Deserialize)]
struct RawHourly {
    #[serde(default)]
    time: Vec<String>,
    #[serde(default)]
    temperature_2m: Vec<Option<f32>>,
    #[serde(default)]
    weather_code: Vec<Option<u8>>,
    #[serde(default)]
    precipitation_probability: Vec<Option<u8>>,
    #[serde(default)]
    is_day: Vec<Option<u8>>,
}

#[derive(Deserialize)]
struct RawDaily {
    #[serde(default)]
    time: Vec<String>,
    #[serde(default)]
    weather_code: Vec<Option<u8>>,
    #[serde(default)]
    temperature_2m_max: Vec<Option<f32>>,
    #[serde(default)]
    temperature_2m_min: Vec<Option<f32>>,
    #[serde(default)]
    precipitation_probability_max: Vec<Option<u8>>,
    #[serde(default)]
    precipitation_sum: Vec<Option<f32>>,
    #[serde(default)]
    uv_index_max: Vec<Option<f32>>,
    #[serde(default)]
    sunrise: Vec<String>,
    #[serde(default)]
    sunset: Vec<String>,
}

#[derive(Deserialize)]
struct RawAir {
    current: Option<RawAirCurrent>,
}

#[derive(Deserialize)]
struct RawAirCurrent {
    #[serde(default)]
    us_aqi: Option<f32>,
    #[serde(default)]
    pm2_5: Option<f32>,
}

#[derive(Deserialize)]
struct RawGeocode {
    #[serde(default)]
    results: Option<Vec<RawGeoResult>>,
}

#[derive(Deserialize)]
struct RawGeoResult {
    #[serde(default)]
    name: String,
    #[serde(default)]
    country: String,
    #[serde(default)]
    admin1: Option<String>,
    #[serde(default)]
    latitude: f64,
    #[serde(default)]
    longitude: f64,
}

fn idx<T: Copy + Default>(v: &[Option<T>], i: usize) -> T {
    v.get(i).and_then(|x| *x).unwrap_or_default()
}

pub fn parse_forecast(json: &str, loc: &Location, air: Option<Air>, now: i64) -> Result<WeatherBundle, String> {
    let raw: RawForecast = serde_json::from_str(json).map_err(|e| format!("bad forecast: {e}"))?;

    let rc = raw.current.ok_or("missing current")?;
    let current = Current {
        time: rc.time,
        temperature: rc.temperature_2m.unwrap_or(0.0),
        apparent: rc.apparent_temperature.unwrap_or(0.0),
        humidity: rc.relative_humidity_2m.unwrap_or(0.0).clamp(0.0, 255.0) as u8,
        is_day: rc.is_day.unwrap_or(0) != 0,
        weather_code: rc.weather_code.unwrap_or(0),
        wind_speed: rc.wind_speed_10m.unwrap_or(0.0),
        wind_direction: rc.wind_direction_10m.unwrap_or(0.0).clamp(0.0, u16::MAX as f32) as u16,
        pressure: rc.pressure_msl.unwrap_or(0.0),
        visibility: rc.visibility.unwrap_or(0.0),
        uv_index: rc.uv_index.unwrap_or(0.0),
        precipitation: rc.precipitation.unwrap_or(0.0),
    };

    let mut hourly = Vec::new();
    if let Some(h) = &raw.hourly {
        let start_key = first_key(&current.time);
        let start = h
            .time
            .iter()
            .position(|t| first_key(t) == start_key)
            .unwrap_or(0);
        for i in start..h.time.len().min(start + 24) {
            hourly.push(Hour {
                time: h.time[i].clone(),
                temperature: idx(&h.temperature_2m, i),
                weather_code: idx(&h.weather_code, i),
                precipitation_probability: h.precipitation_probability.get(i).copied().flatten(),
                is_day: idx(&h.is_day, i) != 0,
            });
        }
    }

    let mut daily = Vec::new();
    if let Some(d) = &raw.daily {
        for i in 0..d.time.len().min(10) {
            daily.push(Day {
                date: d.time[i].clone(),
                weather_code: idx(&d.weather_code, i),
                temp_max: idx(&d.temperature_2m_max, i),
                temp_min: idx(&d.temperature_2m_min, i),
                precipitation_probability_max: d.precipitation_probability_max.get(i).copied().flatten(),
                precipitation_sum: idx(&d.precipitation_sum, i),
                uv_index_max: idx(&d.uv_index_max, i),
                sunrise: d.sunrise.get(i).cloned().unwrap_or_default(),
                sunset: d.sunset.get(i).cloned().unwrap_or_default(),
            });
        }
    }

    Ok(WeatherBundle {
        location: loc.clone(),
        fetched_at: now,
        stale: false,
        timezone: raw.timezone,
        utc_offset_seconds: raw.utc_offset_seconds,
        current,
        hourly,
        daily,
        air,
    })
}

pub fn parse_air(json: &str) -> Option<Air> {
    let raw: RawAir = serde_json::from_str(json).ok()?;
    let c = raw.current?;
    Some(Air {
        us_aqi: c.us_aqi.unwrap_or(0.0).clamp(0.0, u16::MAX as f32) as u16,
        pm2_5: c.pm2_5.unwrap_or(0.0),
    })
}

pub fn parse_geocode(json: &str) -> Vec<Location> {
    let raw: RawGeocode = match serde_json::from_str(json) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    raw.results
        .unwrap_or_default()
        .into_iter()
        .map(|r| Location {
            name: r.name,
            country: r.country,
            admin1: r.admin1,
            latitude: r.latitude,
            longitude: r.longitude,
        })
        .collect()
}

/// First 13 chars of an ISO time: `YYYY-MM-DDTHH`.
fn first_key(time: &str) -> &str {
    time.get(..13).unwrap_or(time)
}

/// Builds a query string, percent-encoding values. `reqwest` without the
/// `query` feature lacks `RequestBuilder::query`, so we assemble URLs directly.
fn build_url(base: &str, params: &[(&str, &str)]) -> String {
    let mut out = String::from(base);
    for (i, (k, v)) in params.iter().enumerate() {
        out.push(if i == 0 { '?' } else { '&' });
        out.push_str(&encode(k));
        out.push('=');
        out.push_str(&encode(v));
    }
    out
}

fn encode(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for b in raw.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

async fn get_text(resp: reqwest::Response) -> Result<String, String> {
    let resp = resp.error_for_status().map_err(|e| e.to_string())?;
    resp.text().await.map_err(|e| e.to_string())
}

pub async fn fetch_bundle(client: &reqwest::Client, loc: &Location) -> Result<WeatherBundle, String> {
    let lat = loc.latitude.to_string();
    let lon = loc.longitude.to_string();

    let forecast_url = build_url(
        FORECAST_URL,
        &[
            ("latitude", &lat),
            ("longitude", &lon),
            ("current", CURRENT_FIELDS),
            ("hourly", HOURLY_FIELDS),
            ("daily", DAILY_FIELDS),
            ("forecast_days", "10"),
            ("timezone", "auto"),
        ],
    );
    let air_url = build_url(
        AIR_URL,
        &[
            ("latitude", &lat),
            ("longitude", &lon),
            ("current", "us_aqi,pm2_5"),
        ],
    );

    let (forecast_res, air_res) = tokio::join!(client.get(&forecast_url).send(), client.get(&air_url).send());

    let forecast_json = get_text(forecast_res.map_err(|e| e.to_string())?).await?;
    let air = match air_res {
        Ok(resp) => match get_text(resp).await {
            Ok(text) => parse_air(&text),
            Err(_) => None,
        },
        Err(_) => None,
    };

    parse_forecast(&forecast_json, loc, air, now_secs())
}

pub async fn search(client: &reqwest::Client, query: &str) -> Result<Vec<Location>, String> {
    let url = build_url(
        GEOCODE_URL,
        &[("name", query), ("count", "8"), ("language", "en")],
    );
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let text = get_text(resp).await?;
    Ok(parse_geocode(&text))
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn london() -> Location {
        Location {
            name: "London".into(),
            country: "United Kingdom".into(),
            admin1: Some("England".into()),
            latitude: 51.50853,
            longitude: -0.12574,
        }
    }

    #[test]
    fn parses_forecast() {
        let air = parse_air(include_str!("../tests/fixtures/air.json"));
        let bundle = parse_forecast(
            include_str!("../tests/fixtures/forecast.json"),
            &london(),
            air,
            1_700_000_000,
        )
        .expect("parse");
        assert_eq!(bundle.daily.len(), 10);
        assert_eq!(bundle.hourly.len(), 24);
        assert_eq!(bundle.hourly[0].time, "2026-11-03T18:00");
        assert_eq!(bundle.current.temperature, 10.7);
        assert_eq!(bundle.timezone, "Europe/London");
        assert_eq!(bundle.air.as_ref().map(|a| a.us_aqi), Some(26));
        assert!(!bundle.stale);
    }

    #[test]
    fn parses_geocode() {
        let list = parse_geocode(include_str!("../tests/fixtures/geocode.json"));
        assert_eq!(list.first().map(|l| l.name.as_str()), Some("London"));
        assert_eq!(list.first().map(|l| l.country.as_str()), Some("United Kingdom"));
    }

    #[test]
    fn empty_geocode() {
        assert!(parse_geocode("{}").is_empty());
    }
}
