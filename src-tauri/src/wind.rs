use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::Http;

const FORECAST_URL: &str = "https://api.open-meteo.com/v1/forecast";
const HOURS: usize = 25;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindGrid {
    pub times: Vec<i64>,
    pub cols: usize,
    pub rows: usize,
    pub lat_min: f64,
    pub lat_max: f64,
    pub lon_min: f64,
    pub lon_max: f64,
    pub u: Vec<Vec<f32>>,
    pub v: Vec<Vec<f32>>,
}

#[derive(Deserialize)]
struct ForecastPoint {
    hourly: Option<Hourly>,
}

#[derive(Deserialize)]
struct Hourly {
    #[serde(default)]
    time: Vec<i64>,
    #[serde(default)]
    wind_speed_10m: Vec<Option<f32>>,
    #[serde(default)]
    wind_direction_10m: Vec<Option<f32>>,
}

#[tauri::command]
pub async fn get_wind_grid(
    http: State<'_, Http>,
    lat_min: f64,
    lat_max: f64,
    lon_min: f64,
    lon_max: f64,
    cols: usize,
    rows: usize,
) -> Result<WindGrid, String> {
    let cols = cols.clamp(2, 8);
    let rows = rows.clamp(2, 8);
    let lat_min = lat_min.clamp(-85.0, 85.0);
    let lat_max = lat_max.clamp(-85.0, 85.0);
    if lat_min >= lat_max || lon_min >= lon_max {
        return Err("invalid wind grid bounds".to_string());
    }

    let points = grid_points(lat_min, lat_max, lon_min, lon_max, cols, rows);
    let lat_list: Vec<String> = points.iter().map(|(lat, _)| format!("{lat:.4}")).collect();
    let lon_list: Vec<String> = points.iter().map(|(_, lon)| format!("{lon:.4}")).collect();
    let url = format!(
        "{FORECAST_URL}?latitude={}&longitude={}&hourly=wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh&timeformat=unixtime&forecast_hours={HOURS}&timezone=GMT",
        lat_list.join(","),
        lon_list.join(","),
    );

    let res = http
        .0
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("wind request failed: {}", res.status()));
    }
    let text = res.text().await.map_err(|e| e.to_string())?;
    parse_grid(&text, cols, rows, lat_min, lat_max, lon_min, lon_max)
}

/// Wind coming from `dir_deg` (clockwise from north) at `speed` km/h, as (east, north) components.
fn to_uv(speed: f32, dir_deg: f32) -> (f32, f32) {
    let rad = dir_deg.to_radians();
    (-speed * rad.sin(), -speed * rad.cos())
}

/// Row-major grid points, row 0 at the north edge.
fn grid_points(
    lat_min: f64,
    lat_max: f64,
    lon_min: f64,
    lon_max: f64,
    cols: usize,
    rows: usize,
) -> Vec<(f64, f64)> {
    let mut out = Vec::with_capacity(cols * rows);
    for row in 0..rows {
        let lat = lat_max - row as f64 * (lat_max - lat_min) / (rows - 1) as f64;
        for col in 0..cols {
            let lon = lon_min + col as f64 * (lon_max - lon_min) / (cols - 1) as f64;
            out.push((lat, lon));
        }
    }
    out
}

fn parse_grid(
    json: &str,
    cols: usize,
    rows: usize,
    lat_min: f64,
    lat_max: f64,
    lon_min: f64,
    lon_max: f64,
) -> Result<WindGrid, String> {
    let expected = cols * rows;
    let points: Vec<ForecastPoint> =
        serde_json::from_str(json).map_err(|e| format!("bad wind response: {e}"))?;
    if points.len() != expected {
        return Err(format!(
            "wind response has {} points, expected {expected}",
            points.len()
        ));
    }

    let mut hourlies = Vec::with_capacity(expected);
    for p in points {
        let hourly = p.hourly.ok_or("wind response missing hourly")?;
        if hourly.time.is_empty() {
            return Err("wind response has empty time".to_string());
        }
        hourlies.push(hourly);
    }

    let times = hourlies[0].time.clone();
    let n = times.len();
    let mut u = vec![Vec::with_capacity(expected); n];
    let mut v = vec![Vec::with_capacity(expected); n];

    for (index, h) in hourlies.iter().enumerate() {
        for t in 0..n {
            let speed = h.wind_speed_10m.get(t).copied().flatten().unwrap_or(0.0);
            let dir = h.wind_direction_10m.get(t).copied().flatten().unwrap_or(0.0);
            let (ue, vn) = to_uv(speed, dir);
            u[t].push(ue);
            v[t].push(vn);
        }
        let _ = index;
    }

    Ok(WindGrid {
        times,
        cols,
        rows,
        lat_min,
        lat_max,
        lon_min,
        lon_max,
        u,
        v,
    })
}

#[cfg(test)]
mod tests {
    use super::{WindGrid, grid_points, parse_grid, to_uv};

    fn approx(a: (f32, f32), b: (f32, f32)) {
        assert!((a.0 - b.0).abs() < 1e-3, "u: {a:?} vs {b:?}");
        assert!((a.1 - b.1).abs() < 1e-3, "v: {a:?} vs {b:?}");
    }

    #[test]
    fn to_uv_cases() {
        approx(to_uv(10.0, 0.0), (0.0, -10.0));
        approx(to_uv(10.0, 270.0), (10.0, 0.0));
        approx(to_uv(10.0, 90.0), (-10.0, 0.0));
        approx(to_uv(0.0, 123.0), (0.0, 0.0));
    }

    #[test]
    fn grid_points_2x2() {
        let pts = grid_points(10.0, 20.0, 30.0, 40.0, 2, 2);
        assert_eq!(pts.len(), 4);
        assert_eq!(pts[0], (20.0, 30.0));
        assert_eq!(pts[1], (20.0, 40.0));
        assert_eq!(pts[2], (10.0, 30.0));
        assert_eq!(pts[3], (10.0, 40.0));
    }

    #[test]
    fn grid_points_3x2_ordering() {
        let pts = grid_points(0.0, 10.0, 0.0, 20.0, 3, 2);
        assert_eq!(pts.len(), 6);
        assert_eq!(pts[0], (10.0, 0.0));
        assert_eq!(pts[1], (10.0, 10.0));
        assert_eq!(pts[2], (10.0, 20.0));
        assert_eq!(pts[3], (0.0, 0.0));
        assert_eq!(pts[4], (0.0, 10.0));
        assert_eq!(pts[5], (0.0, 20.0));
    }

    fn bounds() -> (f64, f64, f64, f64) {
        (10.0, 20.0, 30.0, 40.0)
    }

    #[test]
    fn parse_two_points() {
        let json = r#"[
            {"hourly":{"time":[100,200,300],"wind_speed_10m":[10,null,5],"wind_direction_10m":[0,90,270]}},
            {"hourly":{"time":[100,200],"wind_speed_10m":[0,20],"wind_direction_10m":[180,0]}}
        ]"#;
        let (lat_min, lat_max, lon_min, lon_max) = bounds();
        let grid: WindGrid = parse_grid(json, 2, 1, lat_min, lat_max, lon_min, lon_max).unwrap();
        assert_eq!(grid.times, vec![100, 200, 300]);
        assert_eq!(grid.u.len(), 3);
        // Step 0: point 0 from north, point 1 speed 0.
        assert!((grid.u[0][0]).abs() < 1e-3);
        assert!((grid.v[0][0] + 10.0).abs() < 1e-3);
        assert_eq!(grid.u[0][1], 0.0);
        assert_eq!(grid.v[0][1], 0.0);
        // Step 1: point 0 null speed, point 1 from north at 20.
        assert_eq!(grid.u[1][0], 0.0);
        assert_eq!(grid.v[1][0], 0.0);
        assert!((grid.v[1][1] + 20.0).abs() < 1e-3);
        // Step 2: point 0 from west, point 1 padded to 0.
        assert!((grid.u[2][0] - 5.0).abs() < 1e-3);
        assert_eq!(grid.u[2][1], 0.0);
        assert_eq!(grid.v[2][1], 0.0);
    }

    #[test]
    fn parse_wrong_length() {
        let json = r#"[{"hourly":{"time":[100],"wind_speed_10m":[1],"wind_direction_10m":[0]}}]"#;
        let (lat_min, lat_max, lon_min, lon_max) = bounds();
        assert!(parse_grid(json, 2, 2, lat_min, lat_max, lon_min, lon_max).is_err());
    }
}
