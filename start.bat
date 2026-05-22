@echo off
title Sudoku Duel Server
echo ========================================================
echo   SUDOKU DUEL - 2-PLAYER COMPETITIVE LAUNCHER
echo ========================================================
echo.
echo NOTE: If cross-device mobile play doesn't load (blank page),
echo       please double-click "setup_firewall.bat" to allow
echo       inbound connections through your Windows Firewall.
echo.
echo [1/2] Opening browser to http://localhost:8080 ...
start "" "http://localhost:8080"
echo.
echo [2/2] Starting local HTTP & Sync server...
echo       Press Ctrl+C in this window to stop the server.
echo.
node server.js

