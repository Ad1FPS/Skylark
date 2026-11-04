use std::time::Duration;

use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WebviewWindowBuilder};

use crate::commands::{self, Http};
use crate::store;
use crate::weather;

pub struct TrayStatus(pub MenuItem<tauri::Wry>);

const STATUS_INITIAL: &str = "Skylark";

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let status = MenuItem::with_id(app, "status", STATUS_INITIAL, false, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "Refresh", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&status, &show, &refresh, &sep, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip(STATUS_INITIAL)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event: MenuEvent| match event.id().as_ref() {
            "show" => show_window(app),
            "refresh" => refresh_now(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app)?;

    app.manage(TrayStatus(status));
    Ok(())
}

pub fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return;
    }
    if let Some(cfg) = app.config().app.windows.first()
        && let Ok(window) = WebviewWindowBuilder::from_config(app, cfg).and_then(|b| b.build())
    {
        let _ = window.set_focus();
    }
}

pub fn start_background_refresh(app: &AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(5));
        loop {
            let writer = handle.clone();
            tauri::async_runtime::spawn(async move { refresh(&writer).await });
            std::thread::sleep(Duration::from_secs(15 * 60));
        }
    });
}

pub fn refresh_now(app: &AppHandle) {
    let handle = app.clone();
    tauri::async_runtime::spawn(async move { refresh(&handle).await });
}

async fn refresh(app: &AppHandle) {
    let Some(location) = commands::read_current_location(app) else {
        return;
    };
    let Some(http) = app.try_state::<Http>() else {
        return;
    };
    let Ok(bundle) = weather::fetch_bundle(&http.0, &location).await else {
        return;
    };
    if let Ok(dir) = commands::cache_dir(app) {
        store::write_cache(&dir, &bundle);
    }
    let minutes = minutes_to_rain(&bundle.minutely);
    let text = summary(
        &bundle.location.name,
        bundle.current.temperature,
        bundle.current.weather_code,
        minutes,
    );
    apply_status(app, &text);
}

fn apply_status(app: &AppHandle, text: &str) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(text));
    }
    if let Some(state) = app.try_state::<TrayStatus>() {
        let _ = state.0.set_text(text);
    }
}

/// Minutes until the first rainy step within the next two hours. Steps are 15 minutes apart.
fn minutes_to_rain(minutely: &[weather::Minute]) -> Option<i64> {
    let pos = minutely.iter().take(9).position(|m| m.precipitation >= 0.1)?;
    Some(pos as i64 * 15)
}

fn wmo_label(code: u8) -> &'static str {
    match code {
        0 => "Clear",
        1 | 2 => "Partly cloudy",
        3 => "Overcast",
        45 | 48 => "Fog",
        51..=57 => "Drizzle",
        61..=67 | 80..=82 => "Rain",
        71..=77 | 85 | 86 => "Snow",
        95..=99 => "Thunderstorm",
        _ => "Weather",
    }
}

pub fn summary(city: &str, temp: f32, code: u8, minutes_to_rain: Option<i64>) -> String {
    let mut text = format!("{city} {}° {}", temp.round() as i32, wmo_label(code));
    match minutes_to_rain {
        Some(0) => text.push_str(" · rain now"),
        Some(n) => text.push_str(&format!(" · rain in {n} min")),
        None => {}
    }
    text
}

#[cfg(test)]
mod tests {
    use super::{minutes_to_rain, summary};
    use crate::weather::Minute;

    fn steps(values: &[f32]) -> Vec<Minute> {
        values
            .iter()
            .map(|&precipitation| Minute { time: String::new(), precipitation })
            .collect()
    }

    #[test]
    fn rain_timing_is_index_based_and_capped_at_two_hours() {
        assert_eq!(minutes_to_rain(&steps(&[0.0, 0.0, 0.3])), Some(30));
        assert_eq!(minutes_to_rain(&steps(&[0.5])), Some(0));
        assert_eq!(minutes_to_rain(&steps(&[0.0; 12])), None);
        let mut late = vec![0.0; 9];
        late.push(1.0);
        assert_eq!(minutes_to_rain(&steps(&late)), None);
    }

    #[test]
    fn summary_rain_now() {
        assert_eq!(summary("Berlin", 4.2, 3, Some(0)), "Berlin 4° Overcast · rain now");
    }

    #[test]
    fn summary_rain_in() {
        assert_eq!(summary("Berlin", 4.2, 3, Some(25)), "Berlin 4° Overcast · rain in 25 min");
    }

    #[test]
    fn summary_no_rain() {
        assert_eq!(summary("Berlin", 4.2, 3, None), "Berlin 4° Overcast");
    }
}
