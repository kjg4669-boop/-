use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

/// Shared app state: holds the latest LayerConfig JSON so the preview window
/// can retrieve it immediately via `get_preview_config` invoke (no IPC round-trip).
pub struct PreviewConfigState(pub Mutex<Option<String>>);

impl PreviewConfigState {
    pub fn new() -> Self {
        PreviewConfigState(Mutex::new(None))
    }
}

/// Called by the controller whenever layerConfig changes (via sendPreviewUpdate).
#[tauri::command]
pub fn set_preview_config(state: State<'_, PreviewConfigState>, config: String) {
    if let Ok(mut guard) = state.0.lock() {
        *guard = Some(config);
    }
}

/// Called by the preview window on mount — returns the latest LayerConfig JSON instantly.
#[tauri::command]
pub fn get_preview_config(state: State<'_, PreviewConfigState>) -> Option<String> {
    state.0.lock().ok().and_then(|g| g.clone())
}

#[tauri::command]
pub fn get_displays(app: AppHandle) -> Vec<crate::display::DisplayInfo> {
    let monitors = match app.available_monitors() {
        Ok(m) => m,
        Err(_) => return vec![],
    };

    let primary = app.primary_monitor().ok().flatten();

    monitors
        .into_iter()
        .enumerate()
        .map(|(i, monitor)| {
            let scale = monitor.scale_factor();
            let phys_pos = monitor.position();
            let phys_size = monitor.size();
            let log_pos = phys_pos.to_logical::<f64>(scale);
            let log_size = phys_size.to_logical::<f64>(scale);
            let name = monitor.name().cloned().unwrap_or_else(|| "Display".to_string());
            let is_primary = primary
                .as_ref()
                .map(|p| p.position() == phys_pos && p.size() == phys_size)
                .unwrap_or(i == 0);
            crate::display::DisplayInfo {
                id: i as u32,
                name,
                x: log_pos.x as i32,
                y: log_pos.y as i32,
                width: log_size.width as u32,
                height: log_size.height as u32,
                is_primary,
            }
        })
        .collect()
}

#[tauri::command]
pub async fn open_output_window(app: AppHandle, x: i32, y: i32, width: u32, height: u32) -> Result<(), String> {
    let mid_x = x as f64 + (width as f64 / 2.0);
    let mid_y = y as f64 + (height as f64 / 2.0);

    if let Some(window) = app.get_webview_window("output") {
        // Window was hidden by close_output_window — reposition to the requested
        // monitor and re-show without recreating the webview.
        let _ = window.set_position(tauri::LogicalPosition::new(mid_x, mid_y));
        window.show().map_err(|e| e.to_string())?;
        let _ = window.set_fullscreen(true);
        let _ = window.set_focus();
        return Ok(());
    }

    // Position the window on the target monitor (any point inside that monitor),
    // then let .fullscreen(true) take over the entire monitor.
    // inner_size conflicts with fullscreen on macOS and causes the webview viewport
    // to be constrained to the specified size instead of filling the screen.
    WebviewWindowBuilder::new(&app, "output", WebviewUrl::App("/output".into()))
        .title("Worship Projector - Output")
        .position(mid_x, mid_y)
        .decorations(false)
        .always_on_top(true)
        .resizable(false)
        .fullscreen(true)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn close_output_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("output") {
        // Exit fullscreen first, then hide (not close/destroy).
        // - close() on a macOS fullscreen window can terminate the entire app.
        // - destroy() causes SIGSEGV: CVDisplayLink thread accesses the freed
        //   WebView object (EXC_BAD_ACCESS KERN_INVALID_ADDRESS).
        // Hiding keeps the webview alive so CVDisplayLink remains valid, and
        // avoids triggering the OS window-close cycle that quits the app.
        let _ = window.set_fullscreen(false);
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn open_help_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("help") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "help", WebviewUrl::App("/help".into()))
        .title("도움말 — 찬양 슬라이드 시작하기")
        .inner_size(480.0, 660.0)
        .resizable(false)
        .center()
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn open_stage_display(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("stage") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "stage", WebviewUrl::App("/stage".into()))
        .title("Stage Display — 발표자 모니터")
        .inner_size(1280.0, 720.0)
        .resizable(true)
        .center()
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn close_stage_display(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("stage") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn open_preview_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("preview") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let win = WebviewWindowBuilder::new(&app, "preview", WebviewUrl::App("/preview".into()))
        .title("출력 미리보기")
        .inner_size(480.0, 270.0)
        .resizable(true)
        .always_on_top(true)
        .build()
        .map_err(|e| e.to_string())?;

    // Emit preview:closed to all windows when this window is destroyed,
    // regardless of how it was closed (OS button, programmatic, etc.)
    let app_handle = app.clone();
    win.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            app_handle.emit("preview:closed", ()).ok();
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn close_preview_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("preview") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
