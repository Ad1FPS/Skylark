mod commands;
mod store;
mod weather;

use commands::Http;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Http::new())
        .invoke_handler(tauri::generate_handler![
            commands::search_city,
            commands::get_cached,
            commands::get_weather,
            commands::get_saved,
            commands::save_location,
            commands::remove_location,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
