import SwiftUI

struct DropZoneView: View {
    @EnvironmentObject var appState: AppState
    @Binding var isTargeted: Bool
    var onFileSelected: (URL) -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "doc.badge.arrow.up")
                .font(.system(size: 40))
                .foregroundStyle(.purple.opacity(0.8))

            VStack(spacing: 8) {
                Text("Transcrever áudio ou vídeo")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.white)

                Text("Solte ou escolha um arquivo")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Text("MP3  ·  M4A  ·  WAV  ·  FLAC  ·  MP4  ·  MOV  ·  M4V")
                .font(.caption2)
                .foregroundStyle(.secondary.opacity(0.7))

            Button("Escolher arquivo") {
                chooseFile()
            }
            .buttonStyle(SecondaryButtonStyle())
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(40)
        .background(Color.white.opacity(0.03))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(
                    isTargeted ? Color.purple.opacity(0.5) : Color.white.opacity(0.1),
                    lineWidth: 2
                )
        )
        .padding(24)
        .animation(.easeInOut(duration: 0.2), value: isTargeted)
    }

    private func chooseFile() {
        let panel = NSOpenPanel()
        panel.title = "Selecionar áudio ou vídeo"
        panel.allowedContentTypes = [
            .audio, .mp3, .mpeg4Audio, .wav, .aiff,
            .movie, .video, .mpeg4Movie, .quickTimeMovie,
        ]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false

        if panel.runModal() == .OK, let url = panel.url {
            onFileSelected(url)
        }
    }
}
