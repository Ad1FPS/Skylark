mod alerts;
mod climate;
mod commands;
mod store;
mod tiles;
mod tray;
mod weather;
mod wind;

use commands::Http;
use tauri::Manager;
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

/// Remembered across reopens and restarts: closing to the tray destroys the window unless Keep ready is on,
/// and a fresh window would otherwise come back at the config's default size in the middle of the screen.
const WINDOW_STATE: StateFlags = StateFlags::SIZE.union(StateFlags::POSITION).union(StateFlags::MAXIMIZED);

/// Passed by the autostart entry so a login launch goes straight to the tray.
const MINIMIZED_FLAG: &str = "--minimized";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first: a second launch just reopens the existing instance's window.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        // Restores size and position whenever the main window is (re)created.
        .plugin(tauri_plugin_window_state::Builder::new().with_state_flags(WINDOW_STATE).build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![MINIMIZED_FLAG]),
        ))
        .manage(Http::new())
        .manage(alerts::AlertCache::default())
        .register_asynchronous_uri_scheme_protocol("osmtile", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            let path = request.uri().path().to_string();
            tauri::async_runtime::spawn(async move {
                responder.respond(tiles::serve(&app, &path).await);
            });
        })
        .invoke_handler(tauri::generate_handler![
            commands::search_city,
            commands::locate_ip,
            commands::get_cached,
            commands::get_weather,
            commands::get_saved,
            commands::save_location,
            commands::remove_location,
            commands::set_current_location,
            commands::set_keep_alive,
            commands::set_alert_notifications,
            climate::get_normal,
            wind::get_wind_grid,
            alerts::get_alerts,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event
                && window.label() == "main"
            {
                // The plugin only writes its file on a clean exit, which a tray app rarely gets
                // (Windows shutdown, Task Manager), so write it on every close as well.
                let _ = window.app_handle().save_window_state(WINDOW_STATE);
                if commands::KEEP_ALIVE.load(std::sync::atomic::Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                    tray::notify_visible(window.app_handle(), false);
                }
            }
        })
        .setup(|app| {
            let cache_dir = app.path().app_cache_dir().ok();
            std::thread::spawn(move || {
                if let Some(dir) = cache_dir {
                    tiles::prune_cache(&dir);
                }
            });
            tray::setup(app.handle())?;
            tray::start_background_refresh(app.handle());
            // The window is created here, not by the config, so a login launch can stay in the tray.
            if !std::env::args().any(|a| a == MINIMIZED_FLAG) {
                tray::show_window(app.handle());
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event
                && code.is_none()
            {
                api.prevent_exit();
            }
        });
}
