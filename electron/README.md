# Skribe — Electron

Transcrição local com identificação de falantes: `whisper.cpp` em chunks
paralelos + `pyannote.audio` 3.1 via subprocess Python. UI inspirada no
design Swift original (light theme, accent vermelho, design system completo).
Cross-platform — macOS, Windows, Linux.

O modelo é fixado em **whisper `large-v3`** (a melhor variante para nomes
próprios e palavras raras) — não há tela de configurações no app: qualidade
máxima sempre.

## Como o usuário final usa

1. Baixa o instalador da plataforma dele (`.dmg` / `.exe` / `.AppImage`) do
   GitHub Releases
2. Instala normalmente
3. Abre o app — a primeira execução baixa **automaticamente** o modelo de
   transcrição + cria o ambiente Python + baixa os pesos do pyannote.audio
   (token HuggingFace embutido no app, ~3,5 GB no total, 5-15 min dependendo
   da conexão)
4. Da segunda execução em diante: abre instantâneo

**Token HuggingFace:** está embutido em [`src/main/runtime-setup.js`](src/main/runtime-setup.js)
como uma constante. É um token pessoal de leitura, usado só pra autenticar
o download dos pesos do pyannote.audio na primeira execução. Pode ser
regenerado se for abusado.

## Setup de desenvolvedor

```bash
cd electron
npm install
npm --prefix src/renderer install

# build do binário whisper.cpp (~3-5 min)
npm run setup:whisper
```

A primeira `npm run dev` faz o resto do setup automaticamente (download do
modelo, criação do venv, download dos pesos pyannote). Se preferir disparar
o setup manualmente sem abrir o app, use os scripts legados:

```bash
npm run setup:model
npm run setup:diarization -- --token=hf_xxxxxxxxxxxx
```

## Rodar (dev)

```bash
npm run dev
```

Sobe o Vite (renderer em `http://localhost:5173`) + Electron com hot reload.

## Build (distribuição)

```bash
npm run build:mac     # DMG + ZIP (arm64) em dist/
npm run build:win     # NSIS .exe (x64) em dist/
npm run build:linux   # AppImage (x64) em dist/
```

Cada SO precisa ser empacotado no próprio host (electron-builder não faz
cross-compile do binário whisper.cpp). Para todos de uma vez, use o
workflow CI.

### O que vai no instalador

Bundlado por OS (~150-200 MB):

| Recurso | Origem | Tamanho |
|---|---|---|
| `resources/whisper/main(.exe)` | compilado no CI a partir do whisper.cpp v1.8.4 | ~10-15 MB |
| `resources/whisper/ggml-silero-v5.1.2.bin` | baixado pelo setup-whisper.js | ~864 KB |
| `resources/python/diarize.py` | committed no repo | <10 KB |
| `resources/python/runtime/` (Windows apenas) | python-build-standalone | ~25 MB |

Baixado automaticamente no primeiro launch (~3,5 GB):

- `ggml-large-v3-q5_0.bin` (~1,08 GB) — do HuggingFace
- `python/venv` com torch CPU + pyannote.audio (~1,5 GB) — via pip
- pesos do pyannote (~100 MB) — do HuggingFace usando o token embutido

### CI (GitHub Actions)

`.github/workflows/build-electron.yml` faz build matrix em `macos-14`,
`windows-latest` e `ubuntu-22.04`. Cada job:

1. Clona + `npm install` deps
2. Build do renderer (Vite)
3. **Build do whisper.cpp** (cmake) + download do VAD
4. **Windows apenas**: download do python-build-standalone
5. electron-builder empacota tudo em `extraResources`
6. Upload do `.dmg` / `.exe` / `.AppImage` como artifact (14 dias)

Triggers:

- `workflow_dispatch` — rodar manualmente pela aba Actions
- `git push tag electron-v*` — corta release

### Logo

`build/icon.svg` é a fonte (white squircle + dot vermelho de gravação +
3 linhas de transcript). `icon.png` (1024×1024) e `icon.icns` (multi-res
macOS) são gerados via `qlmanage` + `iconutil`. O ICO para Windows é
gerado automaticamente pelo electron-builder a partir do PNG.

## Arquitetura

```
electron/
├── src/main/
│   ├── index.js              # pipeline: ffmpeg → chunks → whisper paralelo → pyannote
│   ├── runtime-setup.js      # auto-setup no primeiro launch (token HF embutido)
│   └── preload.js            # window.skribe API exposta ao renderer
├── src/renderer/
│   └── src/
│       ├── App.jsx           # state machine + IPC + roteamento
│       ├── lib/{state.js,format.js}
│       ├── components/       # PopIn, Buttons, StatusPill, icons
│       └── views/            # DropZone, SpeakerCount, FirstRunSetup, Result, …
├── scripts/                  # setup manual (legacy / dev)
│   ├── setup-whisper.js
│   ├── setup-diarization.js
│   └── download-model.js
└── resources/
    ├── whisper/
    │   ├── main(.exe)        # bundled — built by CI
    │   ├── ggml-silero-v5.1.2.bin    # bundled
    │   └── models/           # ⊕ runtime download → userData em prod
    └── python/
        ├── diarize.py        # bundled — committed
        ├── runtime/          # bundled (Windows apenas)
        ├── venv/             # ⊕ runtime → userData em prod
        └── hf_cache/         # ⊕ runtime → userData em prod
```

`⊕` = NÃO bundled. Em **dev** vive em `electron/resources/`; em **prod**
vive em `app.getPath('userData')` (gravável pelo usuário, fora do .app/.exe).

### Pipeline

1. `ffmpeg` → WAV 16 kHz mono
2. `ffmpeg segment` → blocos de 60s
3. `whisper.cpp` em **N processos paralelos** (default `cpus/2`) — cada bloco
   transcreve em paralelo. Timestamps absolutos ao concatenar.
4. `pyannote.audio` no **WAV completo** (não chunked) — usa MPS no Apple
   Silicon, fallback CUDA, fallback CPU.
5. Word-level overlap + hysteresis pra atribuir cada palavra ao speaker correto.
6. Rename: speakers viram "Pessoa 1", "Pessoa 2", … na ordem de aparição.

### UI

- Tema claro com bg branco + nested gray (`#F0F1F3`)
- Accent recording red `#DC2626`
- Pills `rounded-full` em todo lugar
- Animações `popIn` (fade + scale com spring overshoot) via framer-motion
- 7 views: DropZone, SpeakerCount, ModelLoading, FirstRunSetup, Processing,
  Result, SpeakerNaming, Error
- Janela 600×1040 (estreita + alta), com cap em 820 de largura
- Cross-fade (160ms) entre views via `AnimatePresence`
