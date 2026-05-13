import Foundation
import SwiftUI

enum AppStatus: Equatable {
    case loading(String)
    case idle
    case recording
    case working
    case done
    case error(String)
    case settings
}

enum ProcessingPhase: Int, CaseIterable {
    case preparing = 0
    case transcribing
    case diarizing
    case merging

    var label: String {
        switch self {
        case .preparing: "Preparando o audio"
        case .transcribing: "Ouvindo com atencao"
        case .diarizing: "Reconhecendo as vozes"
        case .merging: "Juntando tudo"
        }
    }

    var detail: String {
        switch self {
        case .preparing: "Convertendo para o formato ideal..."
        case .transcribing: "Identificando cada palavra do audio..."
        case .diarizing: "Descobrindo quem esta falando em cada trecho..."
        case .merging: "Associando as falas com cada pessoa..."
        }
    }

    var icon: String {
        switch self {
        case .preparing: "headphones"
        case .transcribing: "pencil.and.outline"
        case .diarizing: "person.wave.2"
        case .merging: "puzzlepiece.extension"
        }
    }
}

@MainActor
final class AppState: ObservableObject {
    @Published var status: AppStatus = .idle
    @Published var fileName: String = ""
    @Published var segments: [SkribeSegment] = []
    @Published var currentPhase: ProcessingPhase = .preparing
    @Published var progressMessage: String = ""
    @Published var transcriptionProgress: Double = 0

    @Published var elapsed: Int = 0
    @Published var startTime: Date?
    @Published var endTime: Date?
    @Published var audioDuration: TimeInterval = 0

    @Published var selectedModel: String = UserDefaults.standard.string(forKey: "selectedModel") ?? "openai_whisper-medium" {
        didSet { UserDefaults.standard.set(selectedModel, forKey: "selectedModel") }
    }
    @Published var loadingProgress: Double = 0

    @Published var speakerNames: [String: String] = [:]  // Maps "Pessoa 1" -> custom name

    private var timer: Timer?

    var totalTimeFormatted: String {
        formatElapsed(elapsed)
    }

    var audioDurationFormatted: String {
        formatElapsed(Int(audioDuration))
    }

    var wordCount: Int {
        segments.reduce(0) { $0 + $1.text.split(separator: " ").count }
    }

    var speakerCount: Int {
        Set(segments.map(\.speaker)).count
    }

    func startProcessing() {
        status = .working
        segments = []
        progressMessage = ""
        transcriptionProgress = 0
        currentPhase = .preparing
        elapsed = 0
        startTime = Date()
        endTime = nil

        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.elapsed += 1
            }
        }
    }

    func finishProcessing(segments: [SkribeSegment], fileName: String) {
        timer?.invalidate()
        timer = nil
        endTime = Date()
        self.segments = segments
        self.fileName = fileName
        status = .done
    }

    func failProcessing(error: String) {
        timer?.invalidate()
        timer = nil
        endTime = Date()
        status = .error(error)
    }

    func reset() {
        timer?.invalidate()
        timer = nil
        status = .idle
        segments = []
        fileName = ""
        progressMessage = ""
        transcriptionProgress = 0
        elapsed = 0
        startTime = nil
        endTime = nil
        audioDuration = 0
        speakerNames = [:]
    }

    func formatElapsed(_ sec: Int) -> String {
        if sec < 60 { return "\(sec)s" }
        let m = sec / 60
        let s = sec % 60
        return s > 0 ? "\(m)m \(s)s" : "\(m)m"
    }

    func formatClock(_ date: Date?) -> String {
        guard let date else { return "-" }
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        return f.string(from: date)
    }
}
