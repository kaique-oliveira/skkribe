#!/usr/bin/env bash
# Builds a portable AppImage of Skribe that runs on any glibc-based Linux x86_64 distro.
# Bundles: the .NET self-contained binary, sherpa-onnx native libs, a static ffmpeg+ffprobe.
#
# Run on Linux (Ubuntu/Debian works out of the box). The GH Actions workflow uses ubuntu-latest.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLISH_DIR="$PROJECT_ROOT/Skribe/bin/Release/net8.0/linux-x64/publish"
APPDIR="$PROJECT_ROOT/build/Skribe.AppDir"
OUTPUT="$PROJECT_ROOT/Skribe-x86_64.AppImage"

FFMPEG_URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
APPIMAGETOOL_URL="https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage"

echo "[1/5] dotnet publish (linux-x64 self-contained)..."
cd "$PROJECT_ROOT"
dotnet publish Skribe/Skribe.csproj \
    -c Release \
    -r linux-x64 \
    --self-contained true \
    -p:PublishSingleFile=false \
    -p:IncludeNativeLibrariesForSelfExtract=true

echo "[2/5] Montando AppDir..."
rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/bin"
mkdir -p "$APPDIR/usr/share/applications"
mkdir -p "$APPDIR/usr/share/icons/hicolor/256x256/apps"

cp -r "$PUBLISH_DIR/." "$APPDIR/usr/bin/"
cp "$PROJECT_ROOT/packaging/AppRun" "$APPDIR/AppRun"
chmod +x "$APPDIR/AppRun"
cp "$PROJECT_ROOT/packaging/skribe.desktop" "$APPDIR/skribe.desktop"
cp "$PROJECT_ROOT/packaging/skribe.desktop" "$APPDIR/usr/share/applications/skribe.desktop"
if [ -f "$PROJECT_ROOT/packaging/skribe.png" ]; then
    cp "$PROJECT_ROOT/packaging/skribe.png" "$APPDIR/skribe.png"
    cp "$PROJECT_ROOT/packaging/skribe.png" "$APPDIR/usr/share/icons/hicolor/256x256/apps/skribe.png"
else
    echo "  (sem skribe.png — usando placeholder vazio)"
    # 1x1 transparent PNG so the AppImage tooling doesn't complain
    printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > "$APPDIR/skribe.png"
    cp "$APPDIR/skribe.png" "$APPDIR/usr/share/icons/hicolor/256x256/apps/skribe.png"
fi

echo "[3/5] Baixando ffmpeg static (~30 MB)..."
TMP="$PROJECT_ROOT/build/tmp"
mkdir -p "$TMP"
if [ ! -f "$TMP/ffmpeg-release-amd64-static.tar.xz" ]; then
    curl -L -o "$TMP/ffmpeg-release-amd64-static.tar.xz" "$FFMPEG_URL"
fi
tar -xJf "$TMP/ffmpeg-release-amd64-static.tar.xz" -C "$TMP"
FFMPEG_DIR=$(find "$TMP" -maxdepth 1 -type d -name 'ffmpeg-*-amd64-static' | head -1)
cp "$FFMPEG_DIR/ffmpeg"  "$APPDIR/usr/bin/ffmpeg"
cp "$FFMPEG_DIR/ffprobe" "$APPDIR/usr/bin/ffprobe"
chmod +x "$APPDIR/usr/bin/ffmpeg" "$APPDIR/usr/bin/ffprobe"

echo "[4/5] Baixando appimagetool..."
APPIMAGETOOL="$TMP/appimagetool"
if [ ! -f "$APPIMAGETOOL" ]; then
    curl -L -o "$APPIMAGETOOL" "$APPIMAGETOOL_URL"
    chmod +x "$APPIMAGETOOL"
fi

echo "[5/5] Empacotando AppImage..."
# ARCH env is required by appimagetool, --appimage-extract-and-run avoids needing FUSE in CI.
ARCH=x86_64 "$APPIMAGETOOL" --appimage-extract-and-run "$APPDIR" "$OUTPUT"

echo ""
echo "✅ AppImage gerado: $OUTPUT"
ls -lh "$OUTPUT"
