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

        let modelFolder: URL
        if let cached = Self.cachedModelFolder(for: model) {
            onProgress(0.85, "Modelo já no cache, abrindo…")
            modelFolder = cached
        } else {
            onProgress(0, "Conectando ao repositório de modelos…")
            modelFolder = try await WhisperKit.download(
                variant: model,
                progressCallback: { progress in
                    let fraction = progress.fractionCompleted * 0.85
                    onProgress(fraction, "Baixando WhisperKit: \(Int(progress.fractionCompleted * 100))%")
                }
            )
        }

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

    /// Returns the local folder for `variant` if it already has the required `.mlmodelc` files.
    /// WhisperKit caches under `~/Documents/huggingface/models/argmaxinc/whisperkit-coreml/<variant>/`.
    /// Skipping `WhisperKit.download()` when complete avoids a HuggingFace round-trip on every launch.
    private static func cachedModelFolder(for variant: String) -> URL? {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let folder = docs
            .appendingPathComponent("huggingface/models/argmaxinc/whisperkit-coreml")
            .appendingPathComponent(variant)

        let required = ["AudioEncoder.mlmodelc", "MelSpectrogram.mlmodelc", "TextDecoder.mlmodelc"]
        let allPresent = required.allSatisfy { name in
            FileManager.default.fileExists(atPath: folder.appendingPathComponent(name).path)
        }
        return allPresent ? folder : nil
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

        let decodingOptions = DecodingOptions(
            verbose: false,
            task: .transcribe,
            language: "pt",
            temperatureFallbackCount: 5,
            sampleLength: 224,                      // default safe size for large-v3-turbo
            usePrefillPrompt: true,
            skipSpecialTokens: true,
            withoutTimestamps: false,
            wordTimestamps: true,
            clipTimestamps: [],
            chunkingStrategy: .vad                  // chunk by silence — parallelizes long audio + skips dead air
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
