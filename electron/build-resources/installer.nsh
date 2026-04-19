; Custom NSIS uninstall prompt.
;
; Echo's models + binary + saved settings live in %APPDATA%\Echo\. Ask the
; user whether to remove that folder too on uninstall, defaulting to "keep"
; so a reinstall picks up where they left off.
;
; (An install-time model picker was attempted here, but electron-builder's
; NSIS template processes the `customPageAfterChangeDir` macro before it
; includes this file, so any page we define is never actually registered.
; The in-app Settings dropdown covers the same need instead.)

!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Also delete Echo's downloaded models and saved settings?$\r$\n$\r$\n\
Choose No to keep them for a future reinstall." \
    /SD IDNO \
    IDNO skip_appdata_wipe
  RMDir /r "$APPDATA\Echo"
  skip_appdata_wipe:
!macroend
