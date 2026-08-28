mod commands;
mod display;
mod remote;
mod ndi_output;

fn validate_db_path(path: &str) -> Result<(), String> {
    let p = std::path::Path::new(path);
    if p.components().any(|c| c == std::path::Component::ParentDir) {
        return Err("경로에 '..'를 사용할 수 없습니다".to_string());
    }
    match p.extension().and_then(|e| e.to_str()) {
        Some("db") | Some("sqlite") | Some("sqlite3") => Ok(()),
        _ => Err("백업 파일은 .db 또는 .sqlite 확장자여야 합니다".to_string()),
    }
}

#[tauri::command]
async fn backup_database(app: tauri::AppHandle, dest_path: String) -> Result<(), String> {
    validate_db_path(&dest_path)?;
    let src = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("worship.db");
    // Use SQLite Online Backup API — safe for live, open databases.
    let src_conn = rusqlite::Connection::open(&src).map_err(|e| e.to_string())?;
    let mut dst_conn = rusqlite::Connection::open(&dest_path).map_err(|e| e.to_string())?;
    let backup = rusqlite::backup::Backup::new(&src_conn, &mut dst_conn)
        .map_err(|e| e.to_string())?;
    backup
        .run_to_completion(5, std::time::Duration::from_millis(250), None)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn restore_database(app: tauri::AppHandle, src_path: String) -> Result<(), String> {
    validate_db_path(&src_path)?;
    let dest = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("worship.db");
    // Use SQLite Online Backup API — copies src into the live DB safely.
    // The app must be restarted after restore for the new data to take effect.
    let src_conn = rusqlite::Connection::open(&src_path).map_err(|e| e.to_string())?;
    let mut dst_conn = rusqlite::Connection::open(&dest).map_err(|e| e.to_string())?;
    let backup = rusqlite::backup::Backup::new(&src_conn, &mut dst_conn)
        .map_err(|e| e.to_string())?;
    backup
        .run_to_completion(5, std::time::Duration::from_millis(250), None)
        .map_err(|e| e.to_string())?;
    Ok(())
}

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::default().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:worship.db", vec![
                    tauri_plugin_sql::Migration {
                        version: 1,
                        description: "create_initial_tables",
                        sql: include_str!("../migrations/001_initial.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                        version: 2,
                        description: "fix_fk_constraints",
                        sql: include_str!("../migrations/002_fix_fk.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                        version: 3,
                        description: "create_bible_tables",
                        sql: include_str!("../migrations/003_bible.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                        version: 4,
                        description: "add_service_notes",
                        sql: include_str!("../migrations/004_service_notes.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                        version: 5,
                        description: "add_templates",
                        sql: include_str!("../migrations/005_templates.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                        version: 6,
                        description: "add_tags",
                        sql: include_str!("../migrations/006_tags.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                        version: 7,
                        description: "add_item_notes",
                        sql: include_str!("../migrations/007_item_notes.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                        version: 8,
                        description: "add_copyright_fields",
                        sql: include_str!("../migrations/008_copyright.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                        version: 9,
                        description: "add_alert_templates",
                        sql: include_str!("../migrations/009_alerts.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                        version: 10,
                        description: "add_verse_order",
                        sql: include_str!("../migrations/010_verse_order.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                        version: 11,
                        description: "add_backing_tracks",
                        sql: include_str!("../migrations/011_backing_track.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                        version: 12,
                        description: "add_looks",
                        sql: include_str!("../migrations/012_looks.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                        version: 13,
                        description: "add_announcements",
                        sql: include_str!("../migrations/013_announcements.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                        version: 14,
                        description: "add_song_usage",
                        sql: include_str!("../migrations/014_song_usage.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                        version: 15,
                        description: "add_bpm_chords",
                        sql: include_str!("../migrations/015_bpm_chords.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                        version: 16,
                        description: "add_looks_snapshot",
                        sql: include_str!("../migrations/016_looks_snapshot.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                ])
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::get_displays,
            commands::open_output_window,
            commands::close_output_window,
            commands::open_help_window,
            commands::open_stage_display,
            commands::close_stage_display,
            backup_database,
            restore_database,
            remote::start_remote_server,
            remote::stop_remote_server,
            remote::get_local_ip,
            remote::send_remote_state,
            ndi_output::is_ndi_available,
            ndi_output::start_ndi_output,
            ndi_output::stop_ndi_output,
            commands::open_preview_window,
            commands::close_preview_window,
            commands::set_preview_config,
            commands::get_preview_config,
        ])
        .setup(|app| {
            app.manage(commands::PreviewConfigState::new());
            app.manage(remote::RemoteServerState::new());
            app.manage(ndi_output::NdiOutputState::new());

            // ── 파일 메뉴 ──────────────────────────────────────────────────
            let f_new     = MenuItem::with_id(app, "new_service",      "새 예배",                true, Some("CmdOrCtrl+N"))?;
            let f_open    = MenuItem::with_id(app, "open_service",     "예배 열기",              true, Some("CmdOrCtrl+O"))?;
            let f_sep1    = PredefinedMenuItem::separator(app)?;
            let f_save    = MenuItem::with_id(app, "save_service",     "저장",                  true, Some("CmdOrCtrl+S"))?;
            let f_saveas  = MenuItem::with_id(app, "save_as_service",  "다른 이름으로 저장...",  true, Some("Shift+CmdOrCtrl+S"))?;
            let f_sep2    = PredefinedMenuItem::separator(app)?;
            let f_out_on  = MenuItem::with_id(app, "open_output",      "출력창 열기",            true, None::<&str>)?;
            let f_out_off = MenuItem::with_id(app, "close_output",     "출력창 닫기",            true, None::<&str>)?;
            let f_stage   = MenuItem::with_id(app, "open_stage",       "발표자 모니터 열기",     true, None::<&str>)?;
            let f_sep3    = PredefinedMenuItem::separator(app)?;
            let f_quit    = PredefinedMenuItem::quit(app, None)?;

            let file_menu = Submenu::with_items(app, "파일", true, &[
                &f_new, &f_open, &f_sep1, &f_save, &f_saveas,
                &f_sep2, &f_out_on, &f_out_off, &f_stage, &f_sep3, &f_quit,
            ])?;

            // ── 삽입 메뉴 ──────────────────────────────────────────────────
            let i_new_slide   = MenuItem::with_id(app, "new_slide",      "새 슬라이드",   true, None::<&str>)?;
            let i_dup_slide   = MenuItem::with_id(app, "dup_slide",      "슬라이드 복제", true, None::<&str>)?;
            let i_sep1        = PredefinedMenuItem::separator(app)?;
            let i_add_song    = MenuItem::with_id(app, "add_song",       "찬양 추가",     true, None::<&str>)?;
            let i_add_media   = MenuItem::with_id(app, "add_media",      "미디어 추가",   true, None::<&str>)?;
            let i_add_script  = MenuItem::with_id(app, "add_scripture",  "성경 추가",     true, None::<&str>)?;

            let insert_menu = Submenu::with_items(app, "삽입", true, &[
                &i_new_slide, &i_dup_slide, &i_sep1, &i_add_song, &i_add_media, &i_add_script,
            ])?;

            // ── 슬라이드 쇼 메뉴 ───────────────────────────────────────────
            let s_start   = MenuItem::with_id(app, "show_from_start",   "처음부터",             true, None::<&str>)?;
            let s_current = MenuItem::with_id(app, "show_from_current", "현재 슬라이드부터",    true, None::<&str>)?;
            let s_sep1    = PredefinedMenuItem::separator(app)?;
            let s_hide    = MenuItem::with_id(app, "hide_slide",        "현재 슬라이드 숨기기", true, None::<&str>)?;

            let slideshow_menu = Submenu::with_items(app, "슬라이드 쇼", true, &[
                &s_start, &s_current, &s_sep1, &s_hide,
            ])?;

            // ── 보기 메뉴 ──────────────────────────────────────────────────
            let v_quick    = MenuItem::with_id(app, "quick_search",        "슬라이드 빠른 검색...", true, Some("CmdOrCtrl+K"))?;
            let v_preview  = MenuItem::with_id(app, "open_preview_output", "출력 미리보기",         true, None::<&str>)?;

            #[cfg(feature = "devtools")]
            let view_menu = {
                let v_sep_dev  = PredefinedMenuItem::separator(app)?;
                let v_devtools = MenuItem::with_id(app, "toggle_devtools", "개발자 도구", true, Some("CmdOrCtrl+Alt+I"))?;
                Submenu::with_items(app, "보기", true, &[&v_quick, &v_preview, &v_sep_dev, &v_devtools])?
            };
            #[cfg(not(feature = "devtools"))]
            let view_menu = Submenu::with_items(app, "보기", true, &[&v_quick, &v_preview])?;

            // ── 데이터 메뉴 ────────────────────────────────────────────────
            let d_backup  = MenuItem::with_id(app, "backup_db",  "데이터베이스 백업...", true, None::<&str>)?;
            let d_restore = MenuItem::with_id(app, "restore_db", "데이터베이스 복원...", true, None::<&str>)?;

            let data_menu = Submenu::with_items(app, "데이터", true, &[&d_backup, &d_restore])?;

            // ── 설정 메뉴 ──────────────────────────────────────────────────
            let cfg_open  = MenuItem::with_id(app, "open_settings", "설정...", true, Some("CmdOrCtrl+,"))?;

            let settings_menu = Submenu::with_items(app, "설정", true, &[&cfg_open])?;

            // ── 도움 메뉴 ──────────────────────────────────────────────────
            let h_guide   = MenuItem::with_id(app, "show_help_guide",   "UI 가이드 보기",         true, None::<&str>)?;
            let h_onboard = MenuItem::with_id(app, "reset_onboarding",  "시작 가이드 다시 보기",  true, None::<&str>)?;
            let h_sep1    = PredefinedMenuItem::separator(app)?;
            let h_about   = MenuItem::with_id(app, "show_about",        "Worship Projector 정보...", true, None::<&str>)?;

            let help_menu = Submenu::with_items(app, "도움", true, &[
                &h_guide, &h_onboard, &h_sep1, &h_about,
            ])?;

            // ── 메뉴 등록 ──────────────────────────────────────────────────
            let menu = Menu::with_items(app, &[&file_menu, &insert_menu, &slideshow_menu, &view_menu, &data_menu, &settings_menu, &help_menu])?;
            app.set_menu(menu)?;

            // ── 메뉴 이벤트 핸들러 ─────────────────────────────────────────
            app.on_menu_event(|app, event| {
                if let Some(win) = app.get_webview_window("main") {
                    match event.id().as_ref() {
                        "new_service"      => { win.emit("menu:new-service", ()).ok(); }
                        "open_service"     => { win.emit("menu:open-service", ()).ok(); }
                        "save_service"     => { win.emit("menu:save-service", ()).ok(); }
                        "save_as_service"  => { win.emit("menu:save-as", ()).ok(); }
                        "open_output"      => { win.emit("menu:open-output", ()).ok(); }
                        "close_output"     => { win.emit("menu:close-output", ()).ok(); }
                        "open_stage"       => { win.emit("menu:open-stage", ()).ok(); }
                        "new_slide"        => { win.emit("menu:new-slide", ()).ok(); }
                        "dup_slide"        => { win.emit("menu:dup-slide", ()).ok(); }
                        "add_song"         => { win.emit("menu:add-song", ()).ok(); }
                        "add_media"        => { win.emit("menu:add-media", ()).ok(); }
                        "add_scripture"    => { win.emit("menu:add-scripture", ()).ok(); }
                        "quick_search"     => { win.emit("menu:quick-search", ()).ok(); }
                        "show_from_start"  => { win.emit("menu:show-from-start", ()).ok(); }
                        "show_from_current"=> { win.emit("menu:show-from-current", ()).ok(); }
                        "hide_slide"       => { win.emit("menu:hide-slide", ()).ok(); }
                        "backup_db"        => { win.emit("menu:backup-db", ()).ok(); }
                        "restore_db"       => { win.emit("menu:restore-db", ()).ok(); }
                        "show_help_guide"  => { win.emit("menu:show-help", ()).ok(); }
                        "reset_onboarding" => { win.emit("menu:reset-onboarding", ()).ok(); }
                        "show_about"       => { win.emit("menu:about", ()).ok(); }
                        "open_preview_output" => { win.emit("menu:open-preview", ()).ok(); }
                        "open_settings"    => { win.emit("menu:open-settings", ()).ok(); }
                        #[cfg(feature = "devtools")]
                        "toggle_devtools" => {
                            win.open_devtools();
                            win.emit("menu:toggle-devmode", ()).ok();
                            if let Some(out) = app.get_webview_window("output") { out.open_devtools(); }
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
