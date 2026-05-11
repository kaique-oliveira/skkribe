import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var modelManager = ModelManager()
    @State private var pipeline = TranscriptionPipeline()
    @State private var isTargeted = false

    var body: some View {
        VStack(spacing: 0) {
            TitleBar()

            Group {
                switch appState.status {
                case .loading(let message):
                    ModelLoadingView(message: message)
                        .environmentObject(appState)
                case .idle:
                    DropZoneView(isTargeted: $isTargeted) { url in
                        startProcessing(url: url)
                    }
                    .environmentObject(appState)
                case .recording:
                    RecordingView()
                        .environmentObject(appState)
                case .working:
                    ProcessingView()
                case .done:
                    ResultView()
                case .error(let message):
                    ErrorView(message: message)
                case .settings:
                    SettingsView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Color(nsColor: .init(red: 0.1, green: 0.1, blue: 0.1, alpha: 1)))
        .onDrop(of: [.audio, .fileURL], isTargeted: $isTargeted) { providers in
            handleDrop(providers: providers)
            return true
        }
        .task {
            await modelManager.prepare(modelName: appState.selectedModel, appState: appState)
        }
    }

    private func startProcessing(url: URL) {
        Task {
            await pipeline.process(fileURL: url, appState: appState, modelManager: modelManager)
        }
    }

    private func handleDrop(providers: [NSItemProvider]) {
        for provider in providers {
            provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { data, _ in
                guard let data = data as? Data,
                      let urlString = String(data: data, encoding: .utf8),
                      let url = URL(string: urlString) else { return }

                let audioExtensions = ["mp3", "m4a", "wav", "ogg", "flac", "aac", "mp4"]
                guard audioExtensions.contains(url.pathExtension.lowercased()) else { return }

                Task { @MainActor in
                    startProcessing(url: url)
                }
            }
        }
    }
}

struct TitleBar: View {
    @EnvironmentObject var appState: AppState
    @State private var previousStatus: AppStatus = .idle

    var body: some View {
        HStack {
            Text("Skribe")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.secondary)

            Spacer()

            if case .working = appState.status {
                // no settings button while working
            } else if case .loading = appState.status {
                // no settings button while loading
            } else {
                Button {
                    if case .settings = appState.status {
                        appState.status = previousStatus
                    } else {
                        previousStatus = appState.status
                        appState.status = .settings
                    }
                } label: {
                    Image(systemName: appState.status == .settings ? "xmark" : "gearshape")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 76)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial)
    }
}
