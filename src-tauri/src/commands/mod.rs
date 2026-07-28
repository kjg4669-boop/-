use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

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
            let pos = monitor.position();
            let size = monitor.size();
            let name = monitor.name().cloned().unwrap_or_else(|| "Display".to_string());
            let is_primary = primary
                .as_ref()
                .map(|p| p.position() == pos && p.size() == size)
                .unwrap_or(i == 0);
            crate::display::DisplayInfo {
                id: i as u32,
                name,
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
                is_primary,
            }
        })
        .collect()
}

#[tauri::command]
pub async fn open_output_window(app: AppHandle, x: i32, y: i32, width: u32, height: u32) -> Result<(), String> {
    if app.get_webview_window("output").is_some() {
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "output", WebviewUrl::App("/output".into()))
        .title("Worship Projector - Output")
        .position(x as f64, y as f64)
        .inner_size(width as f64, height as f64)
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
        window.close().map_err(|e| e.to_string())?;
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
