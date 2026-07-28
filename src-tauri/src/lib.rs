mod commands;
mod display;

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
        ])
        .setup(|app| {
            // ── 파일 메뉴 ──────────────────────────────────────────────────
            let f_new     = MenuItem::with_id(app, "new_service",      "새 예배",                true, Some("CmdOrCtrl+N"))?;
            let f_open    = MenuItem::with_id(app, "open_service",     "예배 열기",              true, Some("CmdOrCtrl+O"))?;
            let f_sep1    = PredefinedMenuItem::separator(app)?;
            let f_save    = MenuItem::with_id(app, "save_service",     "저장",                  true, Some("CmdOrCtrl+S"))?;
            let f_saveas  = MenuItem::with_id(app, "save_as_service",  "다른 이름으로 저장...",  true, Some("Shift+CmdOrCtrl+S"))?;
            let f_sep2    = PredefinedMenuItem::separator(app)?;
            let f_out_on  = MenuItem::with_id(app, "open_output",      "출력창 열기",            true, None::<&str>)?;
            let f_out_off = MenuItem::with_id(app, "close_output",     "출력창 닫기",            true, None::<&str>)?;
            let f_stage   = MenuItem::with_id(app, "open_stage",       "Stage Display 열기",    true, None::<&str>)?;
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

            // ── 메뉴 등록 ──────────────────────────────────────────────────
            let menu = Menu::with_items(app, &[&file_menu, &insert_menu, &slideshow_menu])?;
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
                        "show_from_start"  => { win.emit("menu:show-from-start", ()).ok(); }
                        "show_from_current"=> { win.emit("menu:show-from-current", ()).ok(); }
                        "hide_slide"       => { win.emit("menu:hide-slide", ()).ok(); }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
