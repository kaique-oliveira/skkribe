import Foundation
import SpeakerKit

final class DiarizationService: @unchecked Sendable {
    private var speakerKit: SpeakerKit?
    private var isLoaded = false

    struct SpeakerSegmentResult: Sendable {
        let start: Double
        let end: Double
        let speakerId: Int
    }

    func loadModel() async throws {
        if isLoaded { return }
        speakerKit = try await SpeakerKit()
        isLoaded = true
    }

    func diarize(audioSamples: [Float]) async throws -> [SpeakerSegmentResult] {
        guard let speakerKit else {
            throw SkribeError.modelNotLoaded
        }

        let result = try await speakerKit.diarize(audioArray: audioSamples)

        return result.segments.map { segment in
            SpeakerSegmentResult(
                start: Double(segment.startTime),
                end: Double(segment.endTime),
                speakerId: segment.speaker.speakerId ?? -1
            )
        }
    }

    func unload() {
        speakerKit = nil
        isLoaded = false
    }
}
