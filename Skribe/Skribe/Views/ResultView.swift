import SwiftUI

struct ResultView: View {
    @EnvironmentObject var appState: AppState
    @State private var mdSaved = false
    @State private var copied = false
    @State private var showNamingSheet = false

    private let speakerColors: [Color] = [
        .purple, .red, .green, .orange, .cyan, .pink,
    ]
    private let speakerBgColors: [Color] = [
        .purple.opacity(0.07), .red.opacity(0.06), .green.opacity(0.06),
        .orange.opacity(0.06), .cyan.opacity(0.06), .pink.opacity(0.06),
    ]

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Image(systemName: "doc.text")
                        Text(appState.fileName)
                            .font(.headline)
                    }
                    Text("\(appState.wordCount) palavras transcritas · \(appState.speakerCount) pessoas")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                HStack(spacing: 8) {
                    Button("Renomear pessoas") {
                        showNamingSheet = true
                    }
                    .buttonStyle(SecondaryButtonStyle())

                    Button(copied ? "Copiado!" : "Copiar texto") {
                        copyText()
                    }
                    .buttonStyle(SecondaryButtonStyle())

                    Button(mdSaved ? "Salvo!" : "Salvar .md") {
                        saveMarkdown()
                    }
                    .buttonStyle(SecondaryButtonStyle())

                    Button("Nova transcricao") {
                        appState.reset()
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)

            // Timing bar
            if let start = appState.startTime {
                HStack(spacing: 12) {
                    Label("Inicio: **\(appState.formatClock(start))**", systemImage: "clock")
                    Text("·").foregroundStyle(.secondary)
                    Text("Fim: **\(appState.formatClock(appState.endTime))**")
                    Text("·").foregroundStyle(.secondary)
                    Text("Duracao: **\(appState.totalTimeFormatted)**")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 20)
                .padding(.bottom, 12)
            }

            Divider()

            // Transcript
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(appState.segments.enumerated()), id: \.element.id) { index, seg in
                        let prev = index > 0 ? appState.segments[index - 1] : nil
                        let showHeader = prev?.speaker != seg.speaker
                        let colorIndex = speakerIndex(for: seg.speaker)

                        VStack(alignment: .leading, spacing: 4) {
                            if showHeader {
                                HStack(spacing: 8) {
                                    Text(displayName(for: seg.speaker))
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(speakerColors[colorIndex])
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 3)
                                        .background(speakerBgColors[colorIndex], in: Capsule())

                                    Text(seg.formattedStart)
                                        .font(.caption2.monospacedDigit())
                                        .foregroundStyle(.secondary.opacity(0.6))
                                }
                                .padding(.top, index > 0 ? 12 : 0)
                            }

                            Text(seg.text)
                                .font(.body)
                                .foregroundStyle(.white.opacity(0.9))
                                .textSelection(.enabled)
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(speakerBgColors[colorIndex])
                    }
                }
                .padding(.vertical, 12)
            }
        }
        .sheet(isPresented: $showNamingSheet) {
            SpeakerNamingView()
        }
    }

    private func displayName(for speaker: String) -> String {
        appState.speakerNames[speaker] ?? speaker
    }

    private var orderedSpeakers: [String] {
        var seen: [String] = []
        for seg in appState.segments {
            if !seen.contains(seg.speaker) {
                seen.append(seg.speaker)
            }
        }
        return seen
    }

    private func speakerIndex(for speaker: String) -> Int {
        let speakers = orderedSpeakers
        guard let idx = speakers.firstIndex(of: speaker) else { return 0 }
        return idx % speakerColors.count
    }

    private func copyText() {
        let text = appState.segments
            .map { "[\($0.formattedStart)] \(displayName(for: $0.speaker)): \($0.text)" }
            .joined(separator: "\n\n")
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        copied = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { copied = false }
    }

    private func saveMarkdown() {
        let panel = NSSavePanel()
        panel.title = "Salvar transcricao"
        panel.nameFieldStringValue = appState.fileName.replacingOccurrences(
            of: "\\.[^.]+$", with: "", options: .regularExpression) + ".md"
        panel.allowedContentTypes = [.text]

        guard panel.runModal() == .OK, let url = panel.url else { return }

        var lines: [String] = []
        lines.append("# \(appState.fileName)")
        lines.append("")

        // Metadata
        if let start = appState.startTime, let end = appState.endTime {
            lines.append("> **Inicio:** \(appState.formatClock(start))  ·  **Fim:** \(appState.formatClock(end))  ·  **Duracao:** \(appState.totalTimeFormatted)")
            lines.append(">")
            lines.append("> **Participantes:** \(orderedSpeakers.map { displayName(for: $0) }.joined(separator: ", "))")
            lines.append(">")
            lines.append("> **Palavras:** \(appState.wordCount)  ·  **Pessoas:** \(appState.speakerCount)")
            lines.append("")
        }
        lines.append("---")
        lines.append("")

        // Transcript with speaker names
        var lastSpeaker: String?
        for seg in appState.segments {
            if seg.speaker != lastSpeaker {
                if lastSpeaker != nil { lines.append("") }
                let displayedName = displayName(for: seg.speaker)
                lines.append("### \(displayedName)")
                lastSpeaker = seg.speaker
            }
            lines.append("`\(seg.formattedStart)` \(seg.text)")
        }

        try? lines.joined(separator: "\n").write(to: url, atomically: true, encoding: .utf8)
        mdSaved = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { mdSaved = false }
    }
}
