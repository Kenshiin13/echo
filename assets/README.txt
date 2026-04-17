Echo logo application icon package

Files:
- echo_windows_multi_size.ico: Windows ICO containing 16, 24, 32, 48, 64, 128 and 256 px sizes.
- echo_macos_app_icon.icns: macOS app icon.
- echo.iconset/: macOS iconset PNGs for iconutil conversion if needed.
- echo_executable_256.png: executable / installer / large app icon source.
- echo_taskbar_48.png and echo_taskbar_64.png: taskbar / dock-scale variants.
- echo_system_tray_16.png, echo_system_tray_24.png, echo_system_tray_32.png: tray/menu-bar variants with heavier strokes.
- echo_header_top_left_256x96.png: transparent horizontal header logo for the app header.
- echo_app_icon_original_transparent_1024.png: original logo extracted from the black background.

The 16/24/32 px PNG versions intentionally use heavier silhouettes and reduced fine detail because the full original mark is not readable at tray size. The ICO includes standard sizes; use the dedicated tray PNGs where the framework allows setting tray icons separately.
