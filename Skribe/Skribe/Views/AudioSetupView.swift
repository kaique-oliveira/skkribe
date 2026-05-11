import SwiftUI

struct AudioSetupView: View {
    @State private var blackholeInstalled = false
    @State private var isInstalling = false
    @State private var installMessage = ""
    @Environment(\.dismiss) var dismiss

    var body: some View {
        VStack(spacing: 20) {
            VStack(spacing: 16) {
                Image(systemName: "speaker.wave.2.circle.fill")
                    .font(.system(size: 60))
                    .foregroundStyle(.purple)

                Text("Gravar Reuniões")
                    .font(.title2.weight(.semibold))

                Text("Para gravar áudio de reuniões (Discord, Meet, Teams), precisamos do BlackHole Audio Loopback")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            VStack(spacing: 12) {
                HStack(spacing: 12) {
                    Image(systemName: blackholeInstalled ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(blackholeInstalled ? .green : .secondary)
                        .font(.title3)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("BlackHole Audio Loopback")
                            .font(.body.weight(.medium))
                        Text(blackholeInstalled ? "Instalado" : "Não instalado")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()
                }
                .padding(12)
                .background(Color.white.opacity(0.03))
                .cornerRadius(8)

                if !blackholeInstalled {
                    Text(installMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            Spacer()

            HStack(spacing: 12) {
                Button("Cancelar") { dismiss() }
                    .buttonStyle(SecondaryButtonStyle())

                if blackholeInstalled {
                    Button("Pronto") { dismiss() }
                        .buttonStyle(PrimaryButtonStyle())
                } else {
                    Button(isInstalling ? "Instalando..." : "Instalar BlackHole") {
                        installBlackHole()
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(isInstalling)
                }
            }
        }
        .padding(24)
        .frame(width: 420, height: 360)
        .onAppear {
            checkBlackHole()
        }
    }

    private func checkBlackHole() {
        let path = "/Library/Audio/Plug-Ins/HAL/BlackHole.driver"
        blackholeInstalled = FileManager.default.fileExists(atPath: path)
    }

    private func installBlackHole() {
        isInstalling = true
        installMessage = "Baixando BlackHole (~50MB)..."

        DispatchQueue.global().async {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/bin/bash")
            process.arguments = ["-c", """
                BLACKHOLE_PATH="/Library/Audio/Plug-Ins/HAL/BlackHole.driver"
                if [ ! -d "$BLACKHOLE_PATH" ]; then
                    BLACKHOLE_DMG="/tmp/BlackHole.dmg"
                    BLACKHOLE_VERSION="0.7.7"
                    curl -sL "https://github.com/ExistentialAudio/BlackHole/releases/download/v${BLACKHOLE_VERSION}/BlackHole${BLACKHOLE_VERSION}.dmg" -o "$BLACKHOLE_DMG"
                    if [ -f "$BLACKHOLE_DMG" ]; then
                        MOUNT_POINT=$(mktemp -d)
                        hdiutil attach "$BLACKHOLE_DMG" -mountpoint "$MOUNT_POINT" -quiet
                        sudo installer -pkg "$MOUNT_POINT/BlackHole${BLACKHOLE_VERSION}.pkg" -target / -verboseR
                        hdiutil detach "$MOUNT_POINT" -quiet
                        rm -f "$BLACKHOLE_DMG"
                        exit 0
                    fi
                else
                    exit 0
                fi
            """]

            do {
                try process.run()
                process.waitUntilExit()

                DispatchQueue.main.async {
                    isInstalling = false
                    if process.terminationStatus == 0 {
                        installMessage = "✅ Instalação concluída!"
                        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                            checkBlackHole()
                        }
                    } else {
                        installMessage = "❌ Erro na instalação. Tente novamente."
                    }
                }
            } catch {
                DispatchQueue.main.async {
                    isInstalling = false
                    installMessage = "❌ Erro: \(error.localizedDescription)"
                }
            }
        }
    }
}
