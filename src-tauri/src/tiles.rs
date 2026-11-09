use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use tauri::http::{Response, StatusCode, header};
use tauri::{AppHandle, Manager};

use crate::commands::Http;

const TILE_HOST: &str = "https://tile.openstreetmap.org";
/// The OSM Tile Usage Policy asks apps to cache tiles for at least seven days.
const CACHE_TTL: Duration = Duration::from_secs(7 * 24 * 60 * 60);
const MAX_CACHE_BYTES: u64 = 200 * 1024 * 1024;
const USER_AGENT: &str = concat!(
    "Skylark/",
    env!("CARGO_PKG_VERSION"),
    " (+https://github.com/Ad1FPS/Skylark)"
);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Tile {
    pub z: u32,
    pub x: u32,
    pub y: u32,
}

/// Parses `/{z}/{x}/{y}.png`, rejecting anything outside the OSM tile grid.
pub fn parse_path(path: &str) -> Option<Tile> {
    let rest = path.strip_prefix('/')?;
    let mut parts = rest.split('/');
    let z = parse_coord(parts.next()?)?;
    let x = parse_coord(parts.next()?)?;
    let y = parse_coord(parts.next()?.strip_suffix(".png")?)?;
    if parts.next().is_some() || z > 19 {
        return None;
    }
    let span = 1u32 << z;
    if x >= span || y >= span {
        return None;
    }
    Some(Tile { z, x, y })
}

fn parse_coord(text: &str) -> Option<u32> {
    if text.is_empty() || !text.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    text.parse().ok()
}

fn source_url(tile: Tile) -> String {
    let Tile { z, x, y } = tile;
    format!("{TILE_HOST}/{z}/{x}/{y}.png")
}

fn cache_path(root: &Path, tile: Tile) -> PathBuf {
    let y = tile.y;
    root.join("osm")
        .join(tile.z.to_string())
        .join(tile.x.to_string())
        .join(format!("{y}.png"))
}

fn is_fresh(path: &Path) -> bool {
    std::fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|modified| SystemTime::now().duration_since(modified).ok())
        .is_some_and(|age| age < CACHE_TTL)
}

pub async fn serve(app: &AppHandle, path: &str) -> Response<Vec<u8>> {
    let Some(tile) = parse_path(path) else {
        return png_response(StatusCode::BAD_REQUEST, Vec::new());
    };
    let Ok(root) = app.path().app_cache_dir() else {
        return png_response(StatusCode::INTERNAL_SERVER_ERROR, Vec::new());
    };
    let file = cache_path(&root, tile);

    if is_fresh(&file)
        && let Ok(bytes) = std::fs::read(&file)
    {
        return png_response(StatusCode::OK, bytes);
    }

    let Some(client) = app.try_state::<Http>().map(|http| http.0.clone()) else {
        return png_response(StatusCode::INTERNAL_SERVER_ERROR, Vec::new());
    };
    let fetched = client
        .get(source_url(tile))
        .header(header::USER_AGENT, USER_AGENT)
        .send()
        .await;

    match fetched {
        Ok(response) => {
            let status = response.status();
            if status.is_success() {
                match response.bytes().await {
                    Ok(bytes) => {
                        let bytes = bytes.to_vec();
                        write_cache(&file, &bytes);
                        png_response(StatusCode::OK, bytes)
                    }
                    Err(_) => serve_stale_or(&file, StatusCode::BAD_GATEWAY),
                }
            } else {
                let status =
                    StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
                serve_stale_or(&file, status)
            }
        }
        Err(_) => serve_stale_or(&file, StatusCode::BAD_GATEWAY),
    }
}

fn serve_stale_or(file: &Path, status: StatusCode) -> Response<Vec<u8>> {
    match std::fs::read(file) {
        Ok(bytes) => png_response(StatusCode::OK, bytes),
        Err(_) => png_response(status, Vec::new()),
    }
}

fn write_cache(path: &Path, bytes: &[u8]) {
    let Some(parent) = path.parent() else {
        return;
    };
    if std::fs::create_dir_all(parent).is_ok() {
        let _ = std::fs::write(path, bytes);
    }
}

fn png_response(status: StatusCode, body: Vec<u8>) -> Response<Vec<u8>> {
    let builder = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "image/png")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*");
    match builder.body(body) {
        Ok(response) => response,
        Err(_) => Response::new(Vec::new()),
    }
}

/// Keeps the tile cache under the 200 MB cap by dropping the oldest files first.
pub fn prune_cache(root: &Path) {
    let dir = root.join("osm");
    let mut files = Vec::new();
    collect_files(&dir, &mut files);
    let mut total: u64 = files.iter().map(|file| file.1).sum();
    if total <= MAX_CACHE_BYTES {
        return;
    }
    files.sort_by_key(|file| file.2);
    for (path, len, _) in files {
        if total <= MAX_CACHE_BYTES {
            break;
        }
        if std::fs::remove_file(&path).is_ok() {
            total = total.saturating_sub(len);
        }
    }
}

fn collect_files(dir: &Path, out: &mut Vec<(PathBuf, u64, SystemTime)>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_dir() {
            collect_files(&entry.path(), out);
        } else if kind.is_file()
            && let Ok(meta) = entry.metadata()
        {
            let modified = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
            out.push((entry.path(), meta.len(), modified));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{Tile, parse_path};

    #[test]
    fn parses_only_valid_tile_paths() {
        assert_eq!(
            parse_path("/6/32/22.png"),
            Some(Tile { z: 6, x: 32, y: 22 })
        );
        assert_eq!(parse_path("/0/0/0.png"), Some(Tile { z: 0, x: 0, y: 0 }));
        assert_eq!(
            parse_path("/19/524287/524287.png"),
            Some(Tile {
                z: 19,
                x: 524287,
                y: 524287
            })
        );

        for bad in [
            "",
            "/",
            "/6/32/22",
            "/6/32/22.png/",
            "/6/32/22.png/extra",
            "6/32/22.png",
            "/20/0/0.png",
            "/-1/0/0.png",
            "/6/-1/0.png",
            "/6/32/22.jpg",
            "/6/32/22.PNG",
            "/6/3a/22.png",
            "/6/ 3/22.png",
            "/6/32/22.png.png",
            "/1/2/0.png",
            "/1/0/2.png",
            "/6/64/0.png",
            "/6/0/64.png",
        ] {
            assert_eq!(parse_path(bad), None, "should reject {bad:?}");
        }
    }
}
