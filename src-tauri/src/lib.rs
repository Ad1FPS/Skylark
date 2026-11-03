mod commands;
mod store;
mod tray;
mod weather;

use commands::Http;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first: a second launch just reopens the existing instance's window.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .manage(Http::new())
        .invoke_handler(tauri::generate_handler![
            commands::search_city,
            commands::locate_ip,
            commands::get_cached,
            commands::get_weather,
            commands::get_saved,
            commands::save_location,
            commands::remove_location,
            commands::set_current_location,
        ])
        .setup(|app| {
            tray::setup(app.handle())?;
            tray::start_background_refresh(app.handle());
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
