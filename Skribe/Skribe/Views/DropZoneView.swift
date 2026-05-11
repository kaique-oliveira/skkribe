import SwiftUI

struct DropZoneView: View {
    @EnvironmentObject var appState: AppState
    @Binding var isTargeted: Bool
    var onFileSelected: (URL) -> Void

    var body: some View {
        VStack(spacing: 24) {
            // Upload section
            VStack(spacing: 20) {
                Image(systemName: "doc.badge.arrow.up")
                    .font(.system(size: 40))
                    .foregroundStyle(.purple.opacity(0.8))

                VStack(spacing: 8) {
                    Text("Transcrever audio")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.white)

                    Text("Solte ou escolha um arquivo")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Text("MP3  ·  M4A  ·  WAV  ·  OGG  ·  FLAC  ·  AAC")
                    .font(.caption2)
                    .foregroundStyle(.secondary.opacity(0.7))

                Button("Escolher arquivo") {
                    chooseFile()
                }
                .buttonStyle(SecondaryButtonStyle())
            }
            .frame(maxWidth: .infinity)
            .padding(20)
            .background(Color.white.opacity(0.03))
            .cornerRadius(12)
            .border(
                isTargeted ? Color.purple.opacity(0.5) : Color.white.opacity(0.1),
                width: 2
            )

            // Divider
            HStack {
                Rectangle().fill(Color.white.opacity(0.1)).frame(height: 1)
                Text("OU").font(.caption).foregroundStyle(.secondary)
                Rectangle().fill(Color.white.opacity(0.1)).frame(height: 1)
            }

            // Recording section
            VStack(spacing: 16) {
                Image(systemName: "record.circle.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(.red.opacity(0.8))

                VStack(spacing: 8) {
                    Text("Gravar reunião")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.white)

                    Text("Capture áudio de Discord, Meet, Teams, etc")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Button(action: startRecording) {
                    HStack(spacing: 8) {
                        Image(systemName: "record.circle.fill")
                        Text("Iniciar gravação")
                    }
                    .font(.body.weight(.medium))
                    .frame(maxWidth: .infinity)
                    .padding(10)
                    .background(Color.red)
                    .foregroundStyle(.white)
                    .cornerRadius(8)
                }
                .buttonStyle(.plain)
            }
            .frame(maxWidth: .infinity)
            .padding(20)
            .background(Color.white.opacity(0.03))
            .cornerRadius(12)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .animation(.easeInOut(duration: 0.2), value: isTargeted)
    }

    private func startRecording() {
        appState.status = .recording
    }

    private func chooseFile() {
        let panel = NSOpenPanel()
        panel.title = "Selecionar audio"
        panel.allowedContentTypes = [
            .mp3, .mpeg4Audio, .wav, .aiff, .audio,
        ]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false

        if panel.runModal() == .OK, let url = panel.url {
            onFileSelected(url)
        }
    }
}
