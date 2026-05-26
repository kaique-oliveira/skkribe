# Skribe

Transcrição local de reuniões com identificação de falantes. Roda 100% no
dispositivo — sem nuvem, sem telemetria.

Stack: **Electron + React + Vite + Tailwind** no front, **whisper.cpp** (em
chunks paralelos) + **pyannote.audio 3.1** (subprocess Python) no backend.
Cross-platform: macOS (Metal), Windows, Linux.

## Setup e uso

Toda a documentação vive em [`electron/README.md`](electron/README.md) —
instalação, scripts de setup, build cross-platform e arquitetura.

Quickstart:

```bash
cd electron
npm install
npm --prefix src/renderer install
npm run setup:whisper
npm run setup:model
npm run setup:diarization -- --token=hf_xxxxxxxxxxxx
npm run dev
```

## Builds

CI matrix em `.github/workflows/build-electron.yml` (macOS / Windows / Linux).
Trigger via Actions ou `git push tag electron-v*`.
