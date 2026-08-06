use tauri::AppHandle;

/// Holds the NDI output task abort handle (when running)
pub struct NdiOutputState {
    pub abort_handle: std::sync::Mutex<Option<tokio::task::AbortHandle>>,
}

impl NdiOutputState {
    pub fn new() -> Self {
        Self {
            abort_handle: std::sync::Mutex::new(None),
        }
    }
}

/// Returns whether the NDI feature is compiled in
#[tauri::command]
pub fn is_ndi_available() -> bool {
    cfg!(feature = "ndi")
}

// ── Real NDI implementation (only compiled with `--features ndi`) ──────────

#[cfg(feature = "ndi")]
mod ndi_impl {
    // TODO: Integrate with actual ndi-sdk crate API once NDI SDK is installed.
    // The NDI SDK requires separate download and license agreement from ndi.video.
    // After installing the SDK, implement:
    //   1. Initialize NDI with NDIlib_initialize()
    //   2. Create a send instance with NDIlib_send_create()
    //   3. Capture output window frames (use xcap or a shared-buffer IPC approach)
    //   4. Send frames with NDIlib_send_send_video_v2()
    //
    // Reference: https://ndi.video/for-developers/ndi-sdk/
    pub async fn run_ndi_sender(
        _source_name: String,
        _width: u32,
        _height: u32,
        _fps: u32,
    ) {
        // Placeholder: replace with real NDI frame-send loop
        eprintln!("[NDI] Placeholder sender started. Implement ndi_impl::run_ndi_sender with NDI SDK.");
        // Keep task alive so abort works correctly
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
        }
    }
}

// ── Tauri commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_ndi_output(
    source_name: String,
    width: Option<u32>,
    height: Option<u32>,
    fps: Option<u32>,
    ndi_state: tauri::State<'_, NdiOutputState>,
    app: AppHandle,
) -> Result<(), String> {
    #[cfg(not(feature = "ndi"))]
    {
        let _ = (source_name, width, height, fps, app);
        let _ = ndi_state;
        return Err("NDI SDK not available. Rebuild with --features ndi after installing the NDI SDK from https://ndi.video/for-developers/ndi-sdk/".to_string());
    }

    #[cfg(feature = "ndi")]
    {
        let mut guard = ndi_state.abort_handle.lock().map_err(|e| format!("state lock poisoned: {e}"))?;
        if guard.is_some() {
            return Err("NDI output already running".to_string());
        }
        let w = width.unwrap_or(1920);
        let h = height.unwrap_or(1080);
        let f = fps.unwrap_or(30);
        let task = tokio::spawn(ndi_impl::run_ndi_sender(source_name, w, h, f));
        *guard = Some(task.abort_handle());
        Ok(())
    }
}

#[tauri::command]
pub async fn stop_ndi_output(
    ndi_state: tauri::State<'_, NdiOutputState>,
) -> Result<(), String> {
    let mut guard = ndi_state.abort_handle.lock().map_err(|e| format!("state lock poisoned: {e}"))?;
    if let Some(h) = guard.take() {
        h.abort();
    }
    Ok(())
}
