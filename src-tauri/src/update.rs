use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::{Update, UpdaterExt};

/// What the frontend needs to show an update prompt.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
    pub date: Option<String>,
}

impl From<&Update> for UpdateInfo {
    fn from(update: &Update) -> Self {
        Self {
            version: update.version.clone(),
            current_version: update.current_version.clone(),
            notes: update.body.clone(),
            date: update.date.map(|d| d.to_string()),
        }
    }
}

/// Updater errors can be long and technical; the UI only distinguishes failure from success.
fn short(err: impl std::fmt::Display) -> String {
    let message = err.to_string();
    let first_line = message.lines().next().unwrap_or_default().trim();
    let short: String = first_line.chars().take(160).collect();
    if short.is_empty() {
        "update check failed".to_string()
    } else {
        short
    }
}

async fn find_update(app: &AppHandle) -> Result<Option<Update>, String> {
    let mut builder = app.updater_builder();

    // `SKYLARK_UPDATE_URL` points the updater at a local manifest (for testing) instead of the
    // configured GitHub Releases endpoint. It is read at check time, so it also applies to the
    // re-check that install performs.
    if let Ok(raw) = std::env::var("SKYLARK_UPDATE_URL") {
        let endpoint = raw
            .parse::<tauri::Url>()
            .map_err(|_| "invalid SKYLARK_UPDATE_URL".to_string())?;
        builder = builder.endpoints(vec![endpoint]).map_err(short)?;
    }

    builder.build().map_err(short)?.check().await.map_err(short)
}

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    Ok(find_update(&app).await?.as_ref().map(UpdateInfo::from))
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let Some(update) = find_update(&app).await? else {
        return Err("no update available".to_string());
    };

    // The pending `Update` stays local: installing re-checks, so nothing has to be cached in
    // managed state between the check and the install.
    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(short)?;

    app.restart()
}
