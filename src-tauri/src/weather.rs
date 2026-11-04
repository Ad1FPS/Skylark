use serde::{Deserialize, Serialize};

const FORECAST_URL: &str = "https://api.open-meteo.com/v1/forecast";
const AIR_URL: &str = "https://air-quality-api.open-meteo.com/v1/air-quality";
const GEOCODE_URL: &str = "https://geocoding-api.open-meteo.com/v1/search";
const IP_URL: &str = "https://ipwho.is/";

const CURRENT_FIELDS: &str = "temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl,visibility,uv_index,precipitation";
const HOURLY_FIELDS: &str = "temperature_2m,weather_code,precipitation_probability,is_day,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,visibility,uv_index";
const DAILY_FIELDS: &str = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,sunrise,sunset,wind_speed_10m_max,wind_gusts_10m_max,apparent_temperature_max,apparent_temperature_min,daylight_duration,sunshine_duration,precipitation_hours";
const AIR_FIELDS: &str = "us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide";

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
    #[serde(default)]
    pub minutely: Vec<Minute>,
    #[serde(default)]
    pub detail: Detail,
    #[serde(default)]
    pub week: Week,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Minute {
    pub time: String,
    pub precipitation: f32,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Detail {
    pub time: Vec<String>,
    pub temperature: Vec<f32>,
    pub apparent: Vec<f32>,
    pub humidity: Vec<u8>,
    pub dew_point: Vec<f32>,
    pub precipitation: Vec<f32>,
    pub precipitation_probability: Vec<u8>,
    pub cloud_cover: Vec<u8>,
    pub wind_speed: Vec<f32>,
    pub wind_gusts: Vec<f32>,
    pub wind_direction: Vec<u16>,
    pub pressure: Vec<f32>,
    pub visibility: Vec<f32>,
    pub uv_index: Vec<f32>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Week {
    pub time: Vec<String>,
    pub temperature: Vec<f32>,
    pub apparent: Vec<f32>,
    pub precipitation_probability: Vec<u8>,
    pub weather_code: Vec<u8>,
    pub is_day: Vec<bool>,
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

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
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
    #[serde(default)]
    pub wind_speed_max: f32,
    #[serde(default)]
    pub wind_gusts_max: f32,
    #[serde(default)]
    pub apparent_max: f32,
    #[serde(default)]
    pub apparent_min: f32,
    #[serde(default)]
    pub daylight_seconds: f32,
    #[serde(default)]
    pub sunshine_seconds: f32,
    #[serde(default)]
    pub precipitation_hours: f32,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Air {
    pub us_aqi: u16,
    pub pm2_5: f32,
    #[serde(default)]
    pub pm10: f32,
    #[serde(default)]
    pub ozone: f32,
    #[serde(default)]
    pub no2: f32,
    #[serde(default)]
    pub so2: f32,
    #[serde(default)]
    pub co: f32,
    #[serde(default)]
    pub hourly: AirHourly,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AirHourly {
    pub time: Vec<String>,
    pub us_aqi: Vec<u16>,
    pub pm2_5: Vec<f32>,
    pub pm10: Vec<f32>,
    pub ozone: Vec<f32>,
    pub no2: Vec<f32>,
    pub so2: Vec<f32>,
    pub co: Vec<f32>,
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
    #[serde(default)]
    minutely_15: Option<RawMinutely>,
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
    #[serde(default)]
    apparent_temperature: Vec<Option<f32>>,
    #[serde(default)]
    relative_humidity_2m: Vec<Option<f32>>,
    #[serde(default)]
    dew_point_2m: Vec<Option<f32>>,
    #[serde(default)]
    precipitation: Vec<Option<f32>>,
    #[serde(default)]
    cloud_cover: Vec<Option<f32>>,
    #[serde(default)]
    wind_speed_10m: Vec<Option<f32>>,
    #[serde(default)]
    wind_gusts_10m: Vec<Option<f32>>,
    #[serde(default)]
    wind_direction_10m: Vec<Option<f32>>,
    #[serde(default)]
    pressure_msl: Vec<Option<f32>>,
    #[serde(default)]
    visibility: Vec<Option<f32>>,
    #[serde(default)]
    uv_index: Vec<Option<f32>>,
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
    #[serde(default)]
    wind_speed_10m_max: Vec<Option<f32>>,
    #[serde(default)]
    wind_gusts_10m_max: Vec<Option<f32>>,
    #[serde(default)]
    apparent_temperature_max: Vec<Option<f32>>,
    #[serde(default)]
    apparent_temperature_min: Vec<Option<f32>>,
    #[serde(default)]
    daylight_duration: Vec<Option<f32>>,
    #[serde(default)]
    sunshine_duration: Vec<Option<f32>>,
    #[serde(default)]
    precipitation_hours: Vec<Option<f32>>,
}

#[derive(Deserialize)]
struct RawMinutely {
    #[serde(default)]
    time: Vec<String>,
    #[serde(default)]
    precipitation: Vec<Option<f32>>,
}

#[derive(Deserialize)]
struct RawAir {
    current: Option<RawAirCurrent>,
    #[serde(default)]
    hourly: Option<RawAirHourly>,
}

#[derive(Deserialize)]
struct RawAirCurrent {
    #[serde(default)]
    us_aqi: Option<f32>,
    #[serde(default)]
    pm2_5: Option<f32>,
    #[serde(default)]
    pm10: Option<f32>,
    #[serde(default)]
    ozone: Option<f32>,
    #[serde(default)]
    nitrogen_dioxide: Option<f32>,
    #[serde(default)]
    sulphur_dioxide: Option<f32>,
    #[serde(default)]
    carbon_monoxide: Option<f32>,
}

#[derive(Deserialize)]
struct RawAirHourly {
    #[serde(default)]
    time: Vec<String>,
    #[serde(default)]
    us_aqi: Vec<Option<f32>>,
    #[serde(default)]
    pm2_5: Vec<Option<f32>>,
    #[serde(default)]
    pm10: Vec<Option<f32>>,
    #[serde(default)]
    ozone: Vec<Option<f32>>,
    #[serde(default)]
    nitrogen_dioxide: Vec<Option<f32>>,
    #[serde(default)]
    sulphur_dioxide: Vec<Option<f32>>,
    #[serde(default)]
    carbon_monoxide: Vec<Option<f32>>,
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

#[derive(Deserialize)]
struct RawIp {
    #[serde(default)]
    success: bool,
    #[serde(default)]
    city: String,
    #[serde(default)]
    region: String,
    #[serde(default)]
    country: String,
    #[serde(default)]
    latitude: f64,
    #[serde(default)]
    longitude: f64,
}

fn idx<T: Copy + Default>(v: &[Option<T>], i: usize) -> T {
    v.get(i).and_then(|x| *x).unwrap_or_default()
}

fn floats(v: &[Option<f32>], start: usize, end: usize) -> Vec<f32> {
    (start..end).map(|i| idx(v, i)).collect()
}

/// Clamps a float series into whole numbers (0..=max).
fn whole(v: &[Option<f32>], start: usize, end: usize, max: f32) -> Vec<u8> {
    (start..end)
        .map(|i| idx(v, i).clamp(0.0, max) as u8)
        .collect()
}

fn degrees(v: &[Option<f32>], start: usize, end: usize) -> Vec<u16> {
    (start..end)
        .map(|i| idx(v, i).clamp(0.0, u16::MAX as f32) as u16)
        .collect()
}

/// First 10 chars of an ISO time: `YYYY-MM-DD`.
fn day_key(time: &str) -> &str {
    time.get(..10).unwrap_or(time)
}

fn build_detail(h: &RawHourly, current_time: &str) -> Detail {
    let start_key = day_key(current_time);
    let start = h
        .time
        .iter()
        .position(|t| day_key(t) == start_key)
        .unwrap_or(0);
    let end = h.time.len().min(start + 48);
    Detail {
        time: h.time[start..end].to_vec(),
        temperature: floats(&h.temperature_2m, start, end),
        apparent: floats(&h.apparent_temperature, start, end),
        humidity: whole(&h.relative_humidity_2m, start, end, 255.0),
        dew_point: floats(&h.dew_point_2m, start, end),
        precipitation: floats(&h.precipitation, start, end),
        precipitation_probability: (start..end).map(|i| idx(&h.precipitation_probability, i)).collect(),
        cloud_cover: whole(&h.cloud_cover, start, end, 100.0),
        wind_speed: floats(&h.wind_speed_10m, start, end),
        wind_gusts: floats(&h.wind_gusts_10m, start, end),
        wind_direction: degrees(&h.wind_direction_10m, start, end),
        pressure: floats(&h.pressure_msl, start, end),
        visibility: floats(&h.visibility, start, end),
        uv_index: floats(&h.uv_index, start, end),
    }
}

fn build_week(h: &RawHourly, current_time: &str) -> Week {
    let start_key = day_key(current_time);
    let start = h
        .time
        .iter()
        .position(|t| day_key(t) == start_key)
        .unwrap_or(0);
    let end = h.time.len().min(start + 240);
    Week {
        time: h.time[start..end].to_vec(),
        temperature: floats(&h.temperature_2m, start, end),
        apparent: floats(&h.apparent_temperature, start, end),
        precipitation_probability: (start..end).map(|i| idx(&h.precipitation_probability, i)).collect(),
        weather_code: (start..end).map(|i| idx(&h.weather_code, i)).collect(),
        is_day: (start..end).map(|i| idx(&h.is_day, i) != 0).collect(),
    }
}

fn parse_hourly(raw: Option<&RawHourly>, current_time: &str) -> Vec<Hour> {
    let mut hourly = Vec::new();
    if let Some(h) = raw {
        let start_key = first_key(current_time);
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
    hourly
}

fn parse_daily(raw: Option<&RawDaily>) -> Vec<Day> {
    let mut daily = Vec::new();
    if let Some(d) = raw {
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
                wind_speed_max: idx(&d.wind_speed_10m_max, i),
                wind_gusts_max: idx(&d.wind_gusts_10m_max, i),
                apparent_max: idx(&d.apparent_temperature_max, i),
                apparent_min: idx(&d.apparent_temperature_min, i),
                daylight_seconds: idx(&d.daylight_duration, i),
                sunshine_seconds: idx(&d.sunshine_duration, i),
                precipitation_hours: idx(&d.precipitation_hours, i),
            });
        }
    }
    daily
}

fn parse_minutely(raw: Option<&RawMinutely>) -> Vec<Minute> {
    let mut minutely = Vec::new();
    if let Some(m) = raw {
        for (i, time) in m.time.iter().enumerate().take(32) {
            minutely.push(Minute {
                time: time.clone(),
                precipitation: m.precipitation.get(i).copied().flatten().unwrap_or(0.0),
            });
        }
    }
    minutely
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

    let hourly = parse_hourly(raw.hourly.as_ref(), &current.time);
    let daily = parse_daily(raw.daily.as_ref());
    let minutely = parse_minutely(raw.minutely_15.as_ref());
    let detail = raw
        .hourly
        .as_ref()
        .map(|h| build_detail(h, &current.time))
        .unwrap_or_default();
    let week = raw
        .hourly
        .as_ref()
        .map(|h| build_week(h, &current.time))
        .unwrap_or_default();

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
        minutely,
        detail,
        week,
    })
}

pub fn parse_air(json: &str) -> Option<Air> {
    let raw: RawAir = serde_json::from_str(json).ok()?;
    let c = raw.current?;
    let hourly = match &raw.hourly {
        Some(h) => {
            let end = h.time.len().min(48);
            AirHourly {
                time: h.time[..end].to_vec(),
                us_aqi: (0..end)
                    .map(|i| idx(&h.us_aqi, i).clamp(0.0, u16::MAX as f32) as u16)
                    .collect(),
                pm2_5: floats(&h.pm2_5, 0, end),
                pm10: floats(&h.pm10, 0, end),
                ozone: floats(&h.ozone, 0, end),
                no2: floats(&h.nitrogen_dioxide, 0, end),
                so2: floats(&h.sulphur_dioxide, 0, end),
                co: floats(&h.carbon_monoxide, 0, end),
            }
        }
        None => AirHourly::default(),
    };
    Some(Air {
        us_aqi: c.us_aqi.unwrap_or(0.0).clamp(0.0, u16::MAX as f32) as u16,
        pm2_5: c.pm2_5.unwrap_or(0.0),
        pm10: c.pm10.unwrap_or(0.0),
        ozone: c.ozone.unwrap_or(0.0),
        no2: c.nitrogen_dioxide.unwrap_or(0.0),
        so2: c.sulphur_dioxide.unwrap_or(0.0),
        co: c.carbon_monoxide.unwrap_or(0.0),
        hourly,
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

pub fn parse_ip_location(json: &str) -> Result<Location, String> {
    let raw: RawIp =
        serde_json::from_str(json).map_err(|_| "Could not determine location".to_string())?;
    if !raw.success || raw.city.trim().is_empty() {
        return Err("Could not determine location".into());
    }
    let admin1 = if raw.region.trim().is_empty() {
        None
    } else {
        Some(raw.region)
    };
    Ok(Location {
        name: raw.city,
        country: raw.country,
        admin1,
        latitude: raw.latitude,
        longitude: raw.longitude,
    })
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
            ("minutely_15", "precipitation"),
            ("forecast_minutely_15", "32"),
            ("past_minutely_15", "0"),
            ("forecast_days", "10"),
            ("timezone", "auto"),
        ],
    );
    let air_url = build_url(
        AIR_URL,
        &[
            ("latitude", &lat),
            ("longitude", &lon),
            ("current", AIR_FIELDS),
            ("hourly", AIR_FIELDS),
            ("forecast_days", "3"),
            ("timezone", "auto"),
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

pub async fn locate_ip(client: &reqwest::Client) -> Result<Location, String> {
    let url = build_url(
        IP_URL,
        &[("fields", "success,city,region,country,latitude,longitude")],
    );
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let text = get_text(resp).await?;
    parse_ip_location(&text)
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
        assert_eq!(bundle.hourly[0].time, "2026-11-04T07:00");
        assert_eq!(bundle.current.temperature, 9.5);
        assert_eq!(bundle.timezone, "Europe/London");
        assert_eq!(bundle.air.as_ref().map(|a| a.us_aqi), Some(31));
        assert!(!bundle.stale);
        assert_eq!(bundle.minutely.len(), 32);

        assert_eq!(bundle.detail.time.len(), 48);
        assert_eq!(bundle.detail.time[0], "2026-11-04T00:00");
        assert_eq!(bundle.detail.temperature.len(), 48);
        assert_eq!(bundle.detail.apparent.len(), 48);
        assert_eq!(bundle.detail.humidity.len(), 48);
        assert_eq!(bundle.detail.dew_point.len(), 48);
        assert_eq!(bundle.detail.precipitation.len(), 48);
        assert_eq!(bundle.detail.precipitation_probability.len(), 48);
        assert_eq!(bundle.detail.cloud_cover.len(), 48);
        assert_eq!(bundle.detail.wind_speed.len(), 48);
        assert_eq!(bundle.detail.wind_gusts.len(), 48);
        assert_eq!(bundle.detail.wind_direction.len(), 48);
        assert_eq!(bundle.detail.pressure.len(), 48);
        assert_eq!(bundle.detail.visibility.len(), 48);
        assert_eq!(bundle.detail.uv_index.len(), 48);
        assert_eq!(bundle.detail.uv_index[10], 0.45);
        assert_eq!(bundle.daily[0].wind_gusts_max, 47.5);
        assert!((bundle.daily[0].daylight_seconds - 34145.66).abs() < 0.5);

        assert_eq!(bundle.week.time.len(), 240);
        assert_eq!(bundle.week.time[0], "2026-11-04T00:00");
        assert_eq!(bundle.week.temperature.len(), 240);
        assert_eq!(bundle.week.apparent.len(), 240);
        assert_eq!(bundle.week.precipitation_probability.len(), 240);
        assert_eq!(bundle.week.weather_code.len(), 240);
        assert_eq!(bundle.week.is_day.len(), 240);

        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../tests/fixtures/forecast.json")).expect("fixture");
        let first_code = fixture["hourly"]["weather_code"][0].as_u64().expect("code") as u8;
        assert_eq!(bundle.week.weather_code[0], first_code);

        let air = bundle.air.expect("air");
        assert_eq!(air.pm10, 13.4);
        assert_eq!(air.hourly.time.len(), 48);
        assert_eq!(air.hourly.us_aqi[0], 23);
    }

    #[test]
    fn old_bundle_json_still_deserializes() {
        let air = parse_air(include_str!("../tests/fixtures/air.json"));
        let bundle = parse_forecast(
            include_str!("../tests/fixtures/forecast.json"),
            &london(),
            air,
            1_700_000_000,
        )
        .expect("parse");

        let mut value = serde_json::to_value(&bundle).expect("to value");
        if let Some(obj) = value.as_object_mut() {
            obj.remove("detail");
            obj.remove("week");
            if let Some(air) = obj.get_mut("air").and_then(|a| a.as_object_mut()) {
                air.remove("hourly");
            }
            if let Some(day) = obj
                .get_mut("daily")
                .and_then(|d| d.as_array_mut())
                .and_then(|d| d.first_mut())
                .and_then(|d| d.as_object_mut())
            {
                for key in [
                    "windSpeedMax",
                    "windGustsMax",
                    "apparentMax",
                    "apparentMin",
                    "daylightSeconds",
                    "sunshineSeconds",
                    "precipitationHours",
                ] {
                    day.remove(key);
                }
            }
        }

        let restored: WeatherBundle = serde_json::from_value(value).expect("deserialize");
        assert!(restored.detail.time.is_empty());
        assert!(restored.week.time.is_empty());
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

    #[test]
    fn parses_ip_location() {
        let json = r#"{"success":true,"country":"Germany","region":"Hessen","city":"Frankfurt am Main","latitude":50.11,"longitude":8.68}"#;
        let loc = parse_ip_location(json).expect("parse");
        assert_eq!(loc.name, "Frankfurt am Main");
        assert_eq!(loc.country, "Germany");
        assert_eq!(loc.admin1.as_deref(), Some("Hessen"));
        assert_eq!(loc.latitude, 50.11);
        assert_eq!(loc.longitude, 8.68);
    }

    #[test]
    fn ip_location_failure() {
        assert!(parse_ip_location(r#"{"success":false}"#).is_err());
        assert!(parse_ip_location(r#"{"success":true,"city":""}"#).is_err());
        assert!(parse_ip_location("not json").is_err());
    }
}
