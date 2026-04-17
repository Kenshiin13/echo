; Custom NSIS uninstall hook — asks the user whether to keep downloaded
; Whisper models. If they choose No, models are copied to %APPDATA%\Echo\
; models-preserved\ before the installation directory is wiped; the app
; restores them to the install dir on next launch.

!macro customUnInstall
  ; Only prompt if there's at least one .bin model on disk
  IfFileExists "$INSTDIR\resources\app.asar.unpacked\node_modules\nodejs-whisper\cpp\whisper.cpp\models\ggml-*.bin" 0 skip_model_prompt

  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Remove downloaded Whisper models as well?$\r$\n$\r$\n\
Choose No to keep them — they'll be restored automatically the next time you install Echo." \
    /SD IDYES \
    IDYES skip_model_prompt

  ; User chose No — preserve the models outside the install dir
  CreateDirectory "$APPDATA\Echo\models-preserved"
  CopyFiles /SILENT \
    "$INSTDIR\resources\app.asar.unpacked\node_modules\nodejs-whisper\cpp\whisper.cpp\models\*.bin" \
    "$APPDATA\Echo\models-preserved\"

  skip_model_prompt:
!macroend
