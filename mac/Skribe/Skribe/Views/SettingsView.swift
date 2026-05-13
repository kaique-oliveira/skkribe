import SwiftUI
import AppKit

struct SettingsView: View {
    @EnvironmentObject var appState: AppState
    @State private var pendingModel: String?

    private let models = [
        ModelOption(
            id: "openai_whisper-small",
            label: "Small",
            desc: "244 MB · ~3 min para 1h de áudio · bom para rascunhos rápidos, erra em sotaques e nomes próprios"
        ),
        ModelOption(
            id: "openai_whisper-medium",
            label: "Medium · Recomendado",
            desc: "769 MB · ~7 min para 1h · ótimo equilíbrio, raras alucinações, padrão do app"
        ),
        ModelOption(
            id: "openai_whisper-large-v3_turbo",
            label: "Large v3 Turbo",
            desc: "1.6 GB · ~12 min para 1h · destilado do Large v3, qualidade quase igual ao topo com metade do tempo"
        ),
        ModelOption(
            id: "openai_whisper-large-v3",
            label: "Large v3 · Máxima qualidade",
            desc: "3.0 GB · ~25 min para 1h · menos alucinações em silêncio, melhor em áudio longo e sotaque pesado. Usa ~4 GB de RAM/ANE"
        ),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("Performance")
                .font(.title2.weight(.semibold))
                .foregroundStyle(.white)

            // Model selection
            VStack(alignment: .leading, spacing: 12) {
                Text("Modelo de transcricao")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.secondary)

                VStack(spacing: 8) {
                    ForEach(models) { model in
                        ModelCard(
                            model: model,
                            isSelected: appState.selectedModel == model.id,
                            onSelect: {
                                if model.id != appState.selectedModel {
                                    pendingModel = model.id
                                }
                            }
                        )
                    }
                }
                .alert(
                    "Reiniciar para aplicar?",
                    isPresented: Binding(
                        get: { pendingModel != nil },
                        set: { if !$0 { pendingModel = nil } }
                    ),
                    presenting: pendingModel
                ) { _ in
                    Button("Cancelar", role: .cancel) {
                        pendingModel = nil
                    }
                    Button("Reiniciar") {
                        if let newModel = pendingModel {
                            appState.selectedModel = newModel
                            restartApp()
                        }
                    }
                } message: { _ in
                    Text("Para trocar o modelo de transcrição é necessário fechar e abrir o Skribe novamente. Qualquer transcrição em andamento será perdida.")
                }

                Text("Os modelos sao baixados automaticamente na primeira vez (~1-2 minutos dependendo da conexao)")
                    .font(.caption)
                    .foregroundStyle(.secondary.opacity(0.6))
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Sobre")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.secondary)

                Text("Skribe usa WhisperKit + SpeakerKit (Core ML) para transcricao e diarizacao 100% local. Nenhum dado sai do seu Mac.")
                    .font(.caption)
                    .foregroundStyle(.secondary.opacity(0.6))
            }

            Spacer()
        }
        .padding(32)
    }

    private func restartApp() {
        let bundleURL = Bundle.main.bundleURL
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        task.arguments = ["-n", bundleURL.path]
        try? task.run()
        NSApp.terminate(nil)
    }
}

struct ModelOption: Identifiable {
    let id: String
    let label: String
    let desc: String
}

struct ModelCard: View {
    let model: ModelOption
    let isSelected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.label)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.white)
                    Text(model.desc)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.purple)
                }
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(isSelected ? Color.purple.opacity(0.1) : Color.white.opacity(0.03))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(isSelected ? Color.purple.opacity(0.3) : Color.clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}
