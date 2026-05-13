# Skribe

Local meeting transcription & speaker diarization. Runs entirely on-device — no cloud, no telemetry.

## Platforms

| Folder | Stack | Status |
|---|---|---|
| [`mac/`](./mac) | Swift 6 + SwiftUI + WhisperKit + SpeakerKit (Core ML) | ✅ working |
| [`windows/`](./windows) | C# 12 + WinUI 3 + Whisper.cpp (Whisper.net) + sherpa-onnx (PyAnnote v3) | ✅ working |

Both platforms share the same UX (dark theme, drop-zone or record, identical results screen with per-speaker copy) and use ML weights of the **same family** (OpenAI Whisper + PyAnnote v3).

## Why two native ports?

Cross-platform UI frameworks compromise either performance (Electron) or platform fit (Avalonia). Skribe processes hours of audio with ML models — every framework hop costs latency. Each port speaks directly to the native ML runtime on its OS:

- macOS: **Core ML** (Apple Neural Engine) via WhisperKit/SpeakerKit
- Windows: **Whisper.cpp** with optional Vulkan/CUDA + **ONNX Runtime** (DirectML) via sherpa-onnx

---

## macOS

### Requirements

- macOS 14 (Sonoma) or newer — Apple Silicon recommended (M1+)
- Xcode 16+ with Swift 6 toolchain
- ~3 GB free disk (Core ML models cache on first run)

### Run from source

```bash
cd mac/Skribe
open Skribe.xcodeproj
```

In Xcode: select the `Skribe` scheme → Cmd+R (Run). On first launch the app downloads the Whisper Core ML weights (~500 MB to ~1.6 GB).

Or build & run from the command line:

```bash
cd mac/Skribe
xcodebuild -project Skribe.xcodeproj -scheme Skribe -configuration Release build
open build/Build/Products/Release/Skribe.app
```

### Generate the installer (.pkg)

A pre-made script wraps `xcodebuild` + `productbuild` and outputs an unsigned `.pkg` ready to install into `/Applications`:

```bash
cd mac/Skribe
./build-installer.sh
```

Output: `mac/Skribe/Skribe-Installer.pkg`

Install it:

```bash
sudo installer -pkg mac/Skribe/Skribe-Installer.pkg -target /
```

…or just double-click the `.pkg` in Finder.

> The script builds with ad-hoc signing (`CODE_SIGN_IDENTITY="-"`). To distribute outside your machine, edit `project.yml` and set `DEVELOPMENT_TEAM` to your Apple Developer Team ID, then notarize with `xcrun notarytool`.

---

## Windows

### Requirements

- Windows 10 1809 (build 17763) or newer, **x64**
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Windows App SDK 1.6](https://learn.microsoft.com/windows/apps/windows-app-sdk/downloads) (auto-restored via NuGet)
- ~2 GB free disk (models cache to `%LOCALAPPDATA%\Skribe\Models`)

Optional GPU acceleration — uncomment the matching `PackageReference` in `windows/Skribe/Skribe.csproj`:

- **Vulkan** (AMD / Intel / NVIDIA): `Whisper.net.Runtime.Vulkan`
- **CUDA** (NVIDIA only): `Whisper.net.Runtime.Cuda`

### Run from source

```pwsh
cd windows
dotnet restore
dotnet build Skribe.sln -c Debug
dotnet run --project Skribe/Skribe.csproj
```

Or open `windows/Skribe.sln` in Visual Studio 2022 17.10+ → set `Skribe` as the startup project → F5.

### Generate the installer

Two options, depending on how you want to ship.

**Option A — Self-contained folder (.exe + DLLs, no install needed)**

Produces a portable folder you can zip and hand to users. No .NET runtime required on the target machine.

```pwsh
cd windows
dotnet publish Skribe/Skribe.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false
```

Output: `windows/Skribe/bin/Release/net8.0-windows10.0.19041.0/win-x64/publish/`

Run `Skribe.exe` from that folder directly.

**Option B — MSIX package (signed installer)**

Requires Visual Studio 2022 + Windows App SDK + a code-signing certificate (self-signed works for sideload).

1. Open `windows/Skribe.sln` in Visual Studio.
2. Right-click the `Skribe` project → **Publish → Create App Packages…**
3. Choose **Sideloading** (or Store), pick or generate a certificate, target `x64`.
4. Visual Studio outputs an `.msix` plus a `.cer` certificate.

To install on the target machine: import the `.cer` into **Trusted People** (LocalMachine), then double-click the `.msix`.

CLI equivalent (advanced):

```pwsh
cd windows
msbuild Skribe.sln /p:Configuration=Release /p:Platform=x64 /p:GenerateAppxPackageOnBuild=true /p:AppxPackageSigningEnabled=true /p:PackageCertificateThumbprint=<thumbprint>
```

---

## Models

Both ports auto-download Whisper weights on first launch and cache them locally:

- macOS: WhisperKit cache directory (Application Support)
- Windows: `%LOCALAPPDATA%\Skribe\Models`

For diarization on Windows, drop these files next to the Whisper models (one-time manual download):

- `pyannote-segmentation-3.0.onnx` — from [sherpa-onnx releases](https://github.com/k2-fsa/sherpa-onnx/releases)
- `speaker-embedding.onnx` — e.g. `3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx`

If diarization weights are missing, the app falls back to single-speaker mode (full transcript still produced).
