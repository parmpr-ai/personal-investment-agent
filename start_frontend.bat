@echo off
cd /d %~dp0frontend
npm config set registry https://registry.npmjs.org/
npm install
npm run dev
