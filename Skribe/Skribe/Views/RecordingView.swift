import SwiftUI

struct RecordingView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var modelManager = ModelManager()
    @State private var isRecording = false
    @State private var recordingURL: URL?
    @State private var elapsedTime: TimeInterval = 0
    @State private var recordingService = AudioRecordingService()
    @State private var timer: Timer?
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Image(systemName: "mic.circle.fill")
                            .foregroundStyle(.red)
                        Text("Gravando reunião")
                            .font(.headline)
                    }
                    Text("Capturando áudio do seu microfone + reunião")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Button("Cancelar") {
                    if isRecording {
                        Task {
                            await recordingService.stopRecording()
                        }
                    }
                    appState.reset()
                }
                .buttonStyle(SecondaryButtonStyle())
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)

            Divider()

            // Recording UI
            VStack(spacing: 32) {
                Spacer()

                VStack(spacing: 20) {
                    // Timer
                    VStack(spacing: 8) {
                        Text(formatTime(elapsedTime))
                            .font(.system(size: 48, weight: .bold, design: .monospaced))
                            .foregroundStyle(.white)

                        HStack(spacing: 8) {
                            Circle()
                                .fill(.red)
                                .frame(width: 8, height: 8)
                                .opacity(isRecording ? 1 : 0.3)

                            Text(isRecording ? "Gravando..." : "Pronto para gravar")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.secondary)
                        }
                    }

                    // Audio level indicator (fake animation)
                    HStack(spacing: 4) {
                        ForEach(0..<8, id: \.self) { index in
                            RoundedRectangle(cornerRadius: 2)
                                .fill(.purple)
                                .frame(height: CGFloat(20 + Int.random(in: 0...30)))
                                .opacity(isRecording ? Double.random(in: 0.5...1.0) : 0.3)
                                .animation(.easeInOut(duration: 0.1), value: isRecording)
                        }
                    }
                    .frame(height: 50)
                }

                Spacer()

                // Buttons
                HStack(spacing: 16) {
                    if !isRecording {
                        Button(action: startRecording) {
                            HStack(spacing: 8) {
                                Image(systemName: "record.circle.fill")
                                    .font(.title3)
                                Text("Iniciar gravação")
                                    .font(.body.weight(.medium))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(12)
                            .background(Color.red)
                            .foregroundStyle(.white)
                            .cornerRadius(8)
                        }
                        .buttonStyle(.plain)
                    } else {
                        Button(action: stopRecording) {
                            HStack(spacing: 8) {
                                Image(systemName: "stop.circle.fill")
                                    .font(.title3)
                                Text("Parar e transcrever")
                                    .font(.body.weight(.medium))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(12)
                            .background(Color.purple)
                            .foregroundStyle(.white)
                            .cornerRadius(8)
                        }
                        .buttonStyle(.plain)
                    }
                }

                // Error message
                if let error = errorMessage {
                    VStack(spacing: 8) {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.circle.fill")
                                .foregroundStyle(.red)
                            Text(error)
                                .font(.caption)
                        }
                        .padding(12)
                        .background(Color.red.opacity(0.1))
                        .cornerRadius(8)

                        Button("Tentar novamente") {
                            errorMessage = nil
                            startRecording()
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        .frame(maxWidth: .infinity)
                    }
                }

                Spacer()
            }
            .padding(20)
        }
        .onAppear {
            // macOS pede permissão automaticamente na primeira gravação
        }
    }

    private func startRecording() {
        do {
            recordingURL = try recordingService.startRecording()
            isRecording = true
            errorMessage = nil
            startTimer()
        } catch {
            errorMessage = "Erro ao iniciar gravação: \(error.localizedDescription)"
            isRecording = false
        }
    }

    private func stopRecording() {
        Task {
            await recordingService.stopRecording()
            isRecording = false
            stopTimer()

            // Garante que o modelo está carregado
            do {
                appState.status = .loading("Carregando modelo de IA...")
                try await modelManager.prepare(modelName: appState.selectedModel, appState: appState)

                // Transcrever arquivo gravado
                if let url = recordingURL {
                    appState.fileName = url.lastPathComponent
                    let pipeline = TranscriptionPipeline()
                    await pipeline.process(fileURL: url, appState: appState, modelManager: modelManager)
                }
            } catch {
                appState.status = .error("Erro ao carregar modelo: \(error.localizedDescription)")
            }
        }
    }

    private func startTimer() {
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
            elapsedTime = recordingService.getRecordingDuration()
        }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func formatTime(_ seconds: TimeInterval) -> String {
        let hours = Int(seconds) / 3600
        let minutes = (Int(seconds) % 3600) / 60
        let secs = Int(seconds) % 60

        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        } else {
            return String(format: "%d:%02d", minutes, secs)
        }
    }

}
