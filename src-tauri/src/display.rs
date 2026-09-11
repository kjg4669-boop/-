use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DisplayInfo {
    pub id: u32,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

/// macOS: get real display names via NSScreen.localizedName
#[cfg(target_os = "macos")]
pub fn macos_screen_names() -> Vec<String> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSScreen;

    let Some(mtm) = MainThreadMarker::new() else {
        return vec![];
    };
    let screens = NSScreen::screens(mtm);
    screens
        .iter()
        .map(|s| s.localizedName().to_string())
        .collect()
}
