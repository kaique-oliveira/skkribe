#!/bin/bash
# Builds Skribe in Release, signs with Developer ID, packages a .pkg signed with
# Developer ID Installer, and (optionally) notarizes + staples it for Gatekeeper.
#
# Required: Apple Developer Program membership, Developer ID Application cert,
#           Developer ID Installer cert (both in login keychain).
# Optional: notarization — set the 3 env vars below and the script handles it:
#   NOTARIZE_APPLE_ID="you@apple.id"
#   NOTARIZE_TEAM_ID="F9GM9AT45H"
#   NOTARIZE_APP_PASSWORD="app-specific-password"   # https://account.apple.com → Sign-In and Security → App-Specific Passwords

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$PROJECT_DIR/build"
INSTALL_DIR="$BUILD_DIR/payload/Applications"
SCRIPTS_DIR="$BUILD_DIR/scripts"
PKG_OUTPUT="$PROJECT_DIR/Skribe-Installer.pkg"

TEAM_ID="F9GM9AT45H"
APP_SIGN_IDENTITY="Developer ID Application: ${DEV_ID_APP_NAME:-} ($TEAM_ID)"
PKG_SIGN_IDENTITY="Developer ID Installer: ${DEV_ID_INSTALLER_NAME:-} ($TEAM_ID)"

# Discover the actual full names from the keychain (so the user doesn't need to know them)
APP_IDENTITY_FULL=$(security find-identity -v -p codesigning | grep "Developer ID Application" | grep "$TEAM_ID" | head -1 | sed -E 's/.*"(.*)".*/\1/')
PKG_IDENTITY_FULL=$(security find-identity -v | grep "Developer ID Installer" | grep "$TEAM_ID" | head -1 | sed -E 's/.*"(.*)".*/\1/')

if [ -z "$APP_IDENTITY_FULL" ]; then
    echo "❌ Certificado 'Developer ID Application' (team $TEAM_ID) não encontrado no keychain."
    echo "   Abra Xcode → Settings → Accounts → seu Apple ID → Manage Certificates → +"
    echo "   e crie um 'Developer ID Application'."
    exit 1
fi
if [ -z "$PKG_IDENTITY_FULL" ]; then
    echo "❌ Certificado 'Developer ID Installer' (team $TEAM_ID) não encontrado no keychain."
    echo "   Mesmo lugar do Xcode, crie também um 'Developer ID Installer'."
    exit 1
fi

echo "🔑 Usando certificados:"
echo "   App: $APP_IDENTITY_FULL"
echo "   Pkg: $PKG_IDENTITY_FULL"
echo ""

echo "🧹 Limpando build anterior..."
rm -rf "$BUILD_DIR"

echo "🔨 Compilando Skribe (Release)..."
xcodebuild -project "$PROJECT_DIR/Skribe.xcodeproj" \
    -scheme Skribe \
    -configuration Release \
    -derivedDataPath "$BUILD_DIR/xcode" \
    DEVELOPMENT_TEAM="$TEAM_ID" \
    CODE_SIGN_STYLE=Manual \
    CODE_SIGN_IDENTITY="$APP_IDENTITY_FULL" \
    build

APP_BUILT="$BUILD_DIR/xcode/Build/Products/Release/Skribe.app"

echo "🔏 Validando assinatura do .app..."
codesign --verify --deep --strict --verbose=2 "$APP_BUILT"

echo "📦 Preparando payload do .pkg..."
mkdir -p "$INSTALL_DIR" "$SCRIPTS_DIR"
cp -R "$APP_BUILT" "$INSTALL_DIR/"
cp "$PROJECT_DIR/scripts/postinstall" "$SCRIPTS_DIR/"
chmod +x "$SCRIPTS_DIR/postinstall"

echo "🎁 Gerando .pkg assinado..."
productbuild \
    --component "$INSTALL_DIR/Skribe.app" "/Applications" \
    --scripts "$SCRIPTS_DIR" \
    --sign "$PKG_IDENTITY_FULL" \
    --timestamp \
    "$PKG_OUTPUT"

echo "✅ .pkg assinado: $PKG_OUTPUT"

# Notarização (opcional — só roda se as variáveis de ambiente estiverem definidas)
if [ -n "$NOTARIZE_APPLE_ID" ] && [ -n "$NOTARIZE_TEAM_ID" ] && [ -n "$NOTARIZE_APP_PASSWORD" ]; then
    echo ""
    echo "📤 Enviando para notarização Apple..."
    xcrun notarytool submit "$PKG_OUTPUT" \
        --apple-id "$NOTARIZE_APPLE_ID" \
        --team-id "$NOTARIZE_TEAM_ID" \
        --password "$NOTARIZE_APP_PASSWORD" \
        --wait

    echo "📎 Stapling ticket no .pkg..."
    xcrun stapler staple "$PKG_OUTPUT"
    xcrun stapler validate "$PKG_OUTPUT"
    echo "✅ Notarizado e staplado — pronto pra distribuir em qualquer Mac"
else
    echo ""
    echo "ℹ️  Notarização pulada (defina NOTARIZE_APPLE_ID / NOTARIZE_TEAM_ID / NOTARIZE_APP_PASSWORD para notarizar)."
    echo "   Sem notarização o Gatekeeper vai bloquear em Macs de terceiros."
fi

echo ""
echo "📍 Saída: $PKG_OUTPUT"
echo ""
echo "Para instalar localmente:"
echo "  sudo installer -pkg \"$PKG_OUTPUT\" -target /"
echo "  (ou dois-cliques no Finder)"
