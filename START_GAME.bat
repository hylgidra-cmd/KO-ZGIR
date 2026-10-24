@echo off
title 4 KO'ZIR: OMON QOLISH — FULL-STACK SERVER
cd /d "%~dp0"
echo ====================================================================
echo   4 KO'ZIR: OMON QOLISH — BACKEND VA FRONTEND ISHGA TUSHMOQDA...
echo ====================================================================
start "" "http://localhost:3000"
node server.js
pause
