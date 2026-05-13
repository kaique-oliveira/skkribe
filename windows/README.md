# Skribe — Windows

Native Windows port of Skribe — local meeting transcription + speaker diarization, no cloud, no Python. **UX e funcionalidades idênticas ao port macOS.**

## Stack

| Layer | Choice | Why |
|---|---|---|
| UI | **WinUI 3** + .NET 8 + C# | Modern Windows-native, Mica/Acrylic, matches macOS feel |
| State | CommunityToolkit.Mvvm | ObservableObject, ICommand — same MVVM pattern as SwiftUI |
| Transcription | **Whisper.cpp** via `Whisper.net` | Same ML weights as the Mac version (GGML), 100% local |
| Diarization | **sherpa-onnx** + PyAnnote v3 (ONNX) | Best CPU/GPU diarization for .NET, identical pipeline to Mac's SpeakerKit |
| Audio I/O | **NAudio** | Native Windows codec stack |

> Note: a versão atual **não grava áudio** — fluxo idêntico ao macOS. Use arquivos pré-gravados (áudio ou vídeo).

## Requirements

- Windows 10 1809 (build 17763) or newer, **x64**
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Windows App SDK 1.6](https://learn.microsoft.com/windows/apps/windows-app-sdk/downloads) (auto-restored via NuGet)
- ~3 GB free disk (models cache to `%LOCALAPPDATA%\Skribe\Models`)

Optional GPU acceleration — uncomment the matching `PackageReference` in `Skribe/Skribe.csproj`:

- **Vulkan** (AMD / Intel / NVIDIA): `Whisper.net.Runtime.Vulkan`
- **CUDA** (NVIDIA only): `Whisper.net.Runtime.Cuda`

## Run from source

```pwsh
cd windows
dotnet restore
dotnet build Skribe.sln -c Debug
dotnet run --project Skribe/Skribe.csproj
```

Ou abra `windows/Skribe.sln` no Visual Studio 2022 17.10+ → `Skribe` como startup → F5.

## Gerando o executável para compartilhar

A forma mais simples de mandar pra um amigo testar é um **single-file self-contained executable**: gera 1 `.exe` + DLLs nativas em uma pasta, sem precisar de .NET instalado na máquina dele.

### Build

```pwsh
cd windows
dotnet publish Skribe/Skribe.csproj `
  -c Release `
  -r win-x64 `
  --self-contained true `
  -p:PublishSingleFile=true `
  -p:IncludeNativeLibrariesForSelfExtract=true `
  -p:WindowsAppSDKSelfContained=true
```

Saída: `windows/Skribe/bin/Release/net8.0-windows10.0.19041.0/win-x64/publish/`

Dentro vai ter `Skribe.exe` + alguns `.dll` nativos (Whisper, sherpa-onnx). Zipa essa pasta inteira e manda pro seu amigo.

### O que ele precisa fazer

1. Descompactar o zip em qualquer pasta (ex: `C:\Skribe\`)
2. Rodar `Skribe.exe`
3. Na primeira vez o app baixa o modelo Whisper escolhido (~1.5 GB se for o `medium`, padrão). Cache em `%LOCALAPPDATA%\Skribe\Models`
4. Pra diarização (separar vozes), ele precisa baixar manualmente:
   - `pyannote-segmentation-3.0.onnx` — do [sherpa-onnx releases](https://github.com/k2-fsa/sherpa-onnx/releases) (`sherpa-onnx-pyannote-segmentation-3-0.tar.bz2`, descompactar e renomear)
   - `speaker-embedding.onnx` — ex: `3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx`
   - Coloca os dois em `%LOCALAPPDATA%\Skribe\Models\`
   
   Sem esses arquivos o app cai pra modo single-speaker (transcreve tudo como uma pessoa só).

### SmartScreen

Como o `.exe` não é assinado, na primeira vez o Windows SmartScreen vai mostrar **"O Windows protegeu o seu PC"**. Clicar em **"Mais informações" → "Executar assim mesmo"** resolve. Pra assinar de verdade precisa de certificado pago (Sectigo, DigiCert) — não vale a pena pra teste com 1 amigo.

## Empacotamento MSIX (alternativa pra distribuição mais formal)

Se quiser um instalador `.msix` com ícone na Start Menu:

1. Abra `Skribe.sln` no Visual Studio
2. Botão direito no projeto `Skribe` → **Publish → Create App Packages…**
3. Escolha **Sideloading**, gere um certificado auto-assinado, alvo `x64`
4. VS produz um `.msix` + um `.cer`

Na máquina destino:
- Importa o `.cer` em **Trusted People** (LocalMachine)
- Dá dois cliques no `.msix`

## Models

Mesmas 4 opções do Mac, com cache local:

| Modelo | Disco | Tempo p/ 1h | Quando escolher |
|---|---|---|---|
| `ggml-small` | 466 MB | ~3 min | Rascunho rápido |
| `ggml-medium` *(padrão)* | 1.5 GB | ~7 min | Ótimo equilíbrio |
| `ggml-large-v3-turbo` | 1.6 GB | ~12 min | Quase o topo, metade do tempo |
| `ggml-large-v3` | 3.0 GB | ~25 min | Máxima qualidade |

Trocar o modelo em **Settings** mostra um diálogo "Reiniciar para aplicar" — confirmar fecha e reabre o app já com o novo modelo carregando.

## Project layout

```
windows/
├── Skribe.sln
└── Skribe/
    ├── Skribe.csproj
    ├── App.xaml/cs
    ├── MainWindow.xaml/cs       (shell + status routing)
    ├── Models/                  (AppState, AppStatus, SkribeSegment)
    ├── Services/                (Whisper, sherpa-onnx, NAudio, VAD, pipeline)
    ├── Views/                   (idênticos aos do Mac SwiftUI)
    └── Styles/Theme.xaml        (dark palette matching macOS)
```

## Paridade com macOS

- [x] Importar áudio (MP3, M4A, WAV, OGG, FLAC, AAC, WMA, OPUS)
- [x] Importar vídeo (MP4, MOV, M4V, MKV, WEBM, AVI) — extrai trilha de áudio
- [x] Whisper transcription com word-level timestamps
- [x] Speaker diarization (PyAnnote v3)
- [x] Word-level speaker alignment
- [x] Per-speaker "Copiar fala" em cada cabeçalho
- [x] Copiar tudo / Salvar Markdown
- [x] Renomear pessoas
- [x] 4 modelos (Small / Medium / Large v3 Turbo / Large v3)
- [x] Persistência da escolha de modelo
- [x] Diálogo "Reiniciar para aplicar" ao trocar de modelo
- [x] Dark theme idêntico
- [x] Header em 2 linhas com strip de meta (Áudio · Processou em · Início)
- [x] VAD com bail-out cedo se nenhuma fala detectada
- [ ] Gravação de áudio (intencionalmente removida — limitação técnica do macOS sem capturar system audio)
