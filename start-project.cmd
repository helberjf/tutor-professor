@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\start-project.ps1" %*
