//! The window, and nothing more.
//!
//! Deliberately thin: no commands are exposed to the frontend, because the
//! frontend has no need to reach outside the webview. Everything it does — the
//! network, the vision, the learning, the storage — happens in the page. A
//! desktop shell with no bridge to the operating system is a desktop shell with
//! very little that can go wrong.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Only for saving and loading what she has learned, which is the one
        // thing the page genuinely cannot do on its own.
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("EVE could not open a window");
}
