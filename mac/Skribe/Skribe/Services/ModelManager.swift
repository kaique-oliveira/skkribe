import Foundation

@MainActor
final class ModelManager: ObservableObject {
    let transcriptionService = TranscriptionService()
    let diarizationService = DiarizationService()

    func prepare(modelName: String, appState: AppState) async {
        appState.status = .loading("Conectando…")
        appState.loadingProgress = 0

        do {
            try await transcriptionService.loadModel(named: modelName) { @Sendable fraction, message in
                Task { @MainActor in
                    appState.loadingProgress = fraction * 0.9
                    appState.status = .loading(message)
                }
            }

            appState.loadingProgress = 0.9
            appState.status = .loading("Carregando reconhecimento de vozes…")
            try await diarizationService.loadModel()

            appState.loadingProgress = 1.0
            appState.status = .idle
        } catch {
            appState.status = .error(error.localizedDescription)
        }
    }
}
