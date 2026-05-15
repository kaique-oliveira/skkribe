# Skribe — Linux

Native Linux port of Skribe — local meeting transcription + speaker diarization, no cloud. **UX e funcionalidades idênticas aos ports macOS e Windows.**

## Stack

| Layer | Choice | Why |
|---|---|---|
| UI | **Avalonia 11** + .NET 8 + C# | Cross-platform XAML, Fluent theme, mesma sensação dos outros ports |
| State | CommunityToolkit.Mvvm | ObservableObject, mesmo padrão MVVM do Win/Mac |
| Transcription | **Whisper.cpp** via `Whisper.net` | Mesmos GGML weights do Windows, 100% local |
| Diarization | **sherpa-onnx** + PyAnnote v3 | Mesmo pipeline do Win/Mac, runtime Linux x64 oficial via NuGet |
| Audio decode | **ffmpeg static** (bundled no AppImage) | Suporte universal a codec (MP3/M4A/MP4/MOV/MKV/WEBM/etc.) sem dependência da distro |

## Como instalar (usuário final)

1. Baixar **`Skribe-x86_64.AppImage`** da [release mais recente](https://github.com/kaique-oliveira/skribe/releases) ou dos artifacts do GitHub Actions
2. Dar permissão de execução: `chmod +x Skribe-x86_64.AppImage`
3. Dois cliques pra rodar (ou via terminal: `./Skribe-x86_64.AppImage`)

Funciona em **qualquer distro Linux x86_64** com glibc — Ubuntu, Fedora, Arch, Debian, Pop!_OS, Mint, etc. AppImage é self-contained: o ffmpeg, as libs nativas do sherpa-onnx e o runtime .NET estão todos lá dentro.

### Onde ficam os arquivos

- **Modelos Whisper**: `~/.local/share/Skribe/Models/ggml-*.bin` (1.5 GB cada, baixados sob demanda)
- **Modelos diarização**: mesma pasta — `pyannote-segmentation-3.0.onnx` + `speaker-embedding.onnx`
- **Settings** (modelo selecionado): `~/.config/Skribe/settings.json`

### Diarização (opcional)

Pra separar quem disse o quê, baixe manualmente duas vezes:

- `pyannote-segmentation-3.0.onnx` — extraído de [sherpa-onnx releases](https://github.com/k2-fsa/sherpa-onnx/releases) (`sherpa-onnx-pyannote-segmentation-3-0.tar.bz2`)
- `speaker-embedding.onnx` — ex: `3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx`

Coloque os dois em `~/.local/share/Skribe/Models/`. Sem eles o app cai pra modo single-speaker (transcreve, mas tudo como uma pessoa só).

## Como rodar do código-fonte (dev)

Precisa de:
- .NET 8 SDK
- `ffmpeg` e `ffprobe` no `$PATH` (`apt install ffmpeg` ou equivalente)

```bash
cd linux
dotnet restore Skribe.sln
dotnet run --project Skribe/Skribe.csproj
```

## Como gerar o AppImage localmente

Precisa de:
- .NET 8 SDK
- `libfuse2` (no Ubuntu/Debian: `sudo apt install libfuse2`)
- `desktop-file-utils` (no Ubuntu/Debian: `sudo apt install desktop-file-utils`)
- `curl` e `tar`

```bash
cd linux
./packaging/build-appimage.sh
```

Saída: `linux/Skribe-x86_64.AppImage` — uns 200-300 MB (binário .NET self-contained + ffmpeg static + libs nativas).

## Como gerar via GitHub Actions

Mesmo padrão do Windows:

1. <https://github.com/kaique-oliveira/skribe/actions>
2. **Build Linux AppImage** → **Run workflow**
3. Aguarda ~10-15 min (compila .NET, baixa ffmpeg static, empacota)
4. Baixa o artifact **Skribe-Linux-AppImage** no final do run

## Paridade com macOS / Windows

- [x] Importar áudio (MP3, M4A, WAV, OGG, FLAC, AAC, WMA, OPUS)
- [x] Importar vídeo (MP4, MOV, M4V, MKV, WEBM, AVI) — ffmpeg extrai a trilha
- [x] Whisper transcription com word-level timestamps
- [x] Speaker diarization (PyAnnote v3)
- [x] Word-level speaker alignment
- [x] "Copiar fala" por pessoa
- [x] Copiar tudo / Salvar Markdown
- [x] Renomear pessoas
- [x] 4 modelos (Small / Medium / Large v3 Turbo / Large v3)
- [x] Persistência do modelo selecionado em `~/.config/Skribe/settings.json`
- [x] Dialog "Reiniciar para aplicar" ao trocar de modelo
- [x] Dark theme idêntico
- [x] Header em 2 linhas com strip de meta (Áudio · Processou em · Início)
- [x] VAD com bail-out cedo se nenhuma fala detectada
- [x] AppImage portátil — qualquer distro x86_64

## Project layout

```
linux/
├── Skribe.sln
├── Skribe/
│   ├── Skribe.csproj
│   ├── App.axaml / .cs
│   ├── MainWindow.axaml / .cs
│   ├── Program.cs            (entry point)
│   ├── Models/               (AppState, AppStatus, SkribeSegment)
│   ├── Services/             (Whisper.net, sherpa-onnx, ffmpeg subprocess, pipeline)
│   ├── Views/                (XAML Avalonia — mesma estrutura do Mac/Win)
│   └── Styles/Theme.axaml    (paleta dark casando com os outros ports)
└── packaging/
    ├── build-appimage.sh     (script que gera o AppImage)
    ├── AppRun                (entry script dentro do AppImage)
    ├── skribe.desktop        (atalho .desktop do XDG)
    └── skribe.png            (ícone — copiado do Mac)
```

## Limitações / Diferenças

- **Não grava áudio** (paridade com Mac/Win — limitação técnica que afeta os 3 ports da mesma forma)
- **Apenas x86_64** — não geramos AppImage para ARM. Dá pra fazer mudando o RID `linux-x64` → `linux-arm64` no csproj e baixando ffmpeg static ARM, mas não é o foco
- **ffmpeg bundled** = AppImage ~200 MB. Se quiser bundle menor, é só remover do `build-appimage.sh` e exigir que o usuário tenha `ffmpeg` instalado (mais comum do que parece — vem por padrão em várias distros multimedia)
