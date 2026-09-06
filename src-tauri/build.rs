fn main() {
    #[cfg(target_os = "macos")]
    {
        cc::Build::new()
            .flag("-fmodules")
            .file("src/camera_permission.m")
            .compile("camera_permission");
        println!("cargo:rustc-link-lib=framework=AVFoundation");
    }
    tauri_build::build()
}
