import SwiftUI

struct ResultView: View {
    @EnvironmentObject var appState: AppState
    @State private var mdSaved = false
    @State private var copied = false
    @State private var copiedSpeaker: String?
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
            // Header — two rows for breathing room
            VStack(alignment: .leading, spacing: 14) {
                // Row 1: title + summary
                HStack(spacing: 10) {
                    Image(systemName: "doc.text.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(.purple)

                    VStack(alignment: .leading, spacing: 3) {
                        Text(appState.fileName)
                            .font(.headline)
                            .lineLimit(1)
                            .truncationMode(.middle)

                        Text("\(appState.wordCount) palavras  ·  \(appState.speakerCount) \(appState.speakerCount == 1 ? "pessoa" : "pessoas")")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()
                }

                // Row 2: action toolbar
                HStack(spacing: 8) {
                    Button {
                        showNamingSheet = true
                    } label: {
                        Label("Renomear", systemImage: "person.text.rectangle")
                    }
                    .buttonStyle(SecondaryButtonStyle())

                    Button {
                        copyText()
                    } label: {
                        Label(copied ? "Copiado!" : "Copiar texto",
                              systemImage: copied ? "checkmark" : "doc.on.doc")
                    }
                    .buttonStyle(SecondaryButtonStyle())

                    Button {
                        saveMarkdown()
                    } label: {
                        Label(mdSaved ? "Salvo!" : "Salvar .md",
                              systemImage: mdSaved ? "checkmark" : "arrow.down.doc")
                    }
                    .buttonStyle(SecondaryButtonStyle())

                    Spacer()

                    Button {
                        appState.reset()
                    } label: {
                        Label("Nova", systemImage: "plus.circle.fill")
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)
            .padding(.bottom, 14)

            // Timing strip
            HStack(spacing: 14) {
                metaItem(icon: "waveform", label: "Áudio", value: appState.audioDurationFormatted)
                metaDivider()
                metaItem(icon: "hourglass", label: "Processou em", value: appState.totalTimeFormatted)
                if let start = appState.startTime {
                    metaDivider()
                    metaItem(icon: "clock", label: "Início", value: appState.formatClock(start))
                }
                Spacer()
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 14)

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

                                    Button {
                                        copySpeakerText(speaker: seg.speaker)
                                    } label: {
                                        HStack(spacing: 4) {
                                            Image(systemName: copiedSpeaker == seg.speaker ? "checkmark" : "doc.on.doc")
                                            Text(copiedSpeaker == seg.speaker ? "Copiado" : "Copiar fala")
                                        }
                                        .font(.caption2)
                                        .foregroundStyle(speakerColors[colorIndex])
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(speakerBgColors[colorIndex], in: Capsule())
                                    }
                                    .buttonStyle(.plain)
                                    .help("Copiar apenas a fala de \(displayName(for: seg.speaker))")
                                }
                                .padding(.top, index > 0 ? 12 : 0)
                            }

                            Text(seg.text)
                                .font(.body)
                                .foregroundStyle(.white.opacity(0.9))
                                .textSelection(.enabled)
                        }
                        .padding(.horizontal, 24)
                        .padding(.vertical, 6)
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

    @ViewBuilder
    private func metaItem(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.caption2)
                .foregroundStyle(.secondary.opacity(0.7))
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary.opacity(0.7))
            Text(value)
                .font(.caption.monospacedDigit().weight(.medium))
                .foregroundStyle(.white.opacity(0.9))
        }
    }

    @ViewBuilder
    private func metaDivider() -> some View {
        Rectangle()
            .fill(Color.white.opacity(0.08))
            .frame(width: 1, height: 14)
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

    private func copySpeakerText(speaker: String) {
        let lines = appState.segments
            .filter { $0.speaker == speaker }
            .map { "[\($0.formattedStart)] \($0.text)" }
        let header = "# \(displayName(for: speaker))"
        let text = ([header, ""] + lines).joined(separator: "\n")
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        copiedSpeaker = speaker
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            if copiedSpeaker == speaker { copiedSpeaker = nil }
        }
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
