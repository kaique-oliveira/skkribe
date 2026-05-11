import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var appState: AppState

    private let models = [
        ModelOption(id: "openai_whisper-small", label: "Small", desc: "~244 MB · ~3-4min p/ 1h audio · Qualidade muito boa"),
        ModelOption(id: "openai_whisper-medium", label: "Medium", desc: "~769 MB · ~6-8min p/ 1h audio · Qualidade excelente · Recomendado"),
        ModelOption(id: "openai_whisper-large-v3_turbo", label: "Large v3 Turbo", desc: "~1.6 GB · ~18-20min p/ 1h audio · Qualidade maxima"),
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
                            onSelect: { appState.selectedModel = model.id }
                        )
                    }
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
