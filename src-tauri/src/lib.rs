//! The window, and nothing more.
//!
//! Deliberately thin: no commands are exposed to the frontend, because the
//! frontend has no need to reach outside the webview. Everything it does — the
//! network, the vision, the learning, the storage — happens in the page. A
//! desktop shell with no bridge to the operating system is a desktop shell with
//! very little that can go wrong.

/// Let the page use the camera and microphone.
///
/// WebView2 refuses both by default and does not ask anyone — the page simply
/// gets a rejected promise, which looks exactly like a broken camera. Windows
/// itself still governs access through its own privacy settings, so this grants
/// what the OS has already allowed rather than bypassing anything.
#[cfg(target_os = "windows")]
fn allow_media(window: &tauri::WebviewWindow) {
    use webview2_com::PermissionRequestedEventHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2PermissionRequestedEventArgs, COREWEBVIEW2_PERMISSION_KIND_CAMERA,
        COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    };

    let _ = window.with_webview(|webview| unsafe {
        let core = webview.controller().CoreWebView2().unwrap();
        let mut token = Default::default();
        let _ = core.add_PermissionRequested(
            &PermissionRequestedEventHandler::create(Box::new(
                |_, args: Option<ICoreWebView2PermissionRequestedEventArgs>| {
                    if let Some(args) = args {
                        let mut kind = Default::default();
                        args.PermissionKind(&mut kind)?;
                        if kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA
                            || kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE
                        {
                            args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                        }
                    }
                    Ok(())
                },
            )),
            &mut token,
        );
    });
}

#[cfg(not(target_os = "windows"))]
fn allow_media(_window: &tauri::WebviewWindow) {
    // Linux (WebKitGTK) and macOS ask the user themselves, which is what should
    // happen. Nothing to do here.
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Only for saving and loading what she has learned, which is the one
        // thing the page genuinely cannot do on its own.
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                allow_media(&window);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("EVE could not open a window");
}
