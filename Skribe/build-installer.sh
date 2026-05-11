#!/bin/bash

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$PROJECT_DIR/build"
INSTALL_DIR="$BUILD_DIR/payload/Applications"
SCRIPTS_DIR="$BUILD_DIR/scripts"
PKG_OUTPUT="$PROJECT_DIR/Skribe-Installer.pkg"

echo "🔨 Compilando Skribe..."
xcodebuild -project "$PROJECT_DIR/Skribe.xcodeproj" \
    -scheme Skribe \
    -configuration Release \
    -derivedDataPath "$BUILD_DIR/xcode" \
    build

echo "📦 Preparando estrutura do instalador..."
rm -rf "$BUILD_DIR"
mkdir -p "$INSTALL_DIR"
mkdir -p "$SCRIPTS_DIR"

# Copia o app compilado
echo "📋 Copiando app..."
cp -r "$BUILD_DIR/xcode/Build/Products/Release/Skribe.app" "$INSTALL_DIR/"

# Copia o script de pós-instalação
echo "🔧 Preparando script de instalação..."
cp "$PROJECT_DIR/scripts/postinstall" "$SCRIPTS_DIR/"
chmod +x "$SCRIPTS_DIR/postinstall"

# Gera o .pkg
echo "🎁 Gerando arquivo .pkg..."
productbuild \
    --component "$INSTALL_DIR/Skribe.app" "/Applications" \
    --scripts "$SCRIPTS_DIR" \
    "$PKG_OUTPUT"

echo ""
echo "✅ Instalador gerado com sucesso!"
echo "📍 Localização: $PKG_OUTPUT"
echo ""
echo "Para instalar:"
echo "  sudo installer -pkg \"$PKG_OUTPUT\" -target /"
echo ""
echo "Ou abra o .pkg diretamente no Finder"
