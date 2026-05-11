import Foundation
import WhisperKit

final class TranscriptionService: @unchecked Sendable {
    private var whisperKit: WhisperKit?
    private var isLoaded = false

    struct Segment: Sendable {
        let start: Double
        let end: Double
        let text: String
    }

    func loadModel(named model: String, onProgress: @Sendable @escaping (Double, String) -> Void) async throws {
        if isLoaded { return }

        onProgress(0, "Conectando ao repositório de modelos…")

        let modelFolder = try await WhisperKit.download(
            variant: model,
            progressCallback: { progress in
                let fraction = progress.fractionCompleted * 0.85
                onProgress(fraction, "Baixando WhisperKit: \(Int(progress.fractionCompleted * 100))%")
            }
        )

        onProgress(0.87, "Carregando modelo na memória…")

        let config = WhisperKitConfig(
            modelFolder: modelFolder.path(percentEncoded: false),
            verbose: false,
            prewarm: true,
            load: true
        )
        whisperKit = try await WhisperKit(config)
        isLoaded = true
    }

    struct WordTiming: Sendable {
        let word: String
        let start: Double
        let end: Double
        let probability: Double
    }

    struct SegmentWithWords: Sendable {
        let start: Double
        let end: Double
        let text: String
        let words: [WordTiming]
    }

    func transcribe(audioURL: URL, translateToPortuguese: Bool = false) async throws -> [SegmentWithWords] {
        guard let whisperKit else {
            throw SkribeError.modelNotLoaded
        }

        // CRITICAL FIX: Force Portuguese transcription with large-v3-turbo
        // large-v3-turbo has native PT support and requires default sampleLength
        let decodingOptions = DecodingOptions(
            verbose: true,                          // Enable to debug language detection
            task: .transcribe,                      // Always transcribe (not translate)
            language: "pt",                         // FORCE Portuguese (now works correctly)
            temperatureFallbackCount: 5,
            sampleLength: 224,                      // FIXED: Use default for large-v3-turbo (448 caused buffer overflow)
            usePrefillPrompt: true,                 // Re-enabled: works correctly with large-v3-turbo
            skipSpecialTokens: true,
            withoutTimestamps: false,
            wordTimestamps: true,
            clipTimestamps: [],
            concurrentWorkerCount: 4
        )

        let results = try await whisperKit.transcribe(
            audioPath: audioURL.path(percentEncoded: false),
            decodeOptions: decodingOptions
        )

        var segments: [SegmentWithWords] = []
        for result in results {
            for segment in result.segments {
                let text = segment.text.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !text.isEmpty else { continue }

                // Extract word-level timestamps
                var words: [WordTiming] = []
                if let segmentWords = segment.words {
                    for word in segmentWords {
                        words.append(WordTiming(
                            word: word.word,
                            start: Double(word.start),
                            end: Double(word.end),
                            probability: Double(word.probability)
                        ))
                    }
                }

                segments.append(SegmentWithWords(
                    start: Double(segment.start),
                    end: Double(segment.end),
                    text: text,
                    words: words
                ))
            }
        }

        return segments
    }

    func unload() {
        whisperKit = nil
        isLoaded = false
    }
}
