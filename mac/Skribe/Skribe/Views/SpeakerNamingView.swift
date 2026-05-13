import SwiftUI

struct SpeakerNamingView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss

    @State private var localNames: [String: String] = [:]

    private var speakers: [String] {
        var seen: [String] = []
        for seg in appState.segments {
            if !seen.contains(seg.speaker) {
                seen.append(seg.speaker)
            }
        }
        return seen
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Renomear participantes")
                    .font(.headline)
                Spacer()
                Button("×") { dismiss() }
                    .font(.title2)
                    .foregroundStyle(.secondary)
            }
            .padding(16)
            .background(Color.white.opacity(0.02))
            .border(Color.white.opacity(0.1), width: 1)

            // Speaker list
            ScrollView {
                VStack(spacing: 12) {
                    ForEach(speakers, id: \.self) { speaker in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(speaker)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)

                            TextField("Nome (ex: João, Maria)", text: .init(
                                get: { localNames[speaker] ?? "" },
                                set: { localNames[speaker] = $0 }
                            ))
                            .textFieldStyle(.roundedBorder)
                            .font(.body)
                        }
                        .padding(12)
                        .background(Color.white.opacity(0.03))
                        .cornerRadius(8)
                    }
                }
                .padding(16)
            }

            Divider()

            // Buttons
            HStack(spacing: 12) {
                Button("Cancelar") { dismiss() }
                    .buttonStyle(SecondaryButtonStyle())

                Button("Salvar nomes") {
                    appState.speakerNames = localNames
                    dismiss()
                }
                .buttonStyle(PrimaryButtonStyle())
            }
            .padding(16)
        }
        .frame(width: 400, height: 300)
        .onAppear {
            localNames = appState.speakerNames
        }
    }
}
