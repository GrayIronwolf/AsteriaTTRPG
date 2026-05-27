@echo off
cd /d %~dp0..\
node scripts\generate-content-manifest.js
pause
