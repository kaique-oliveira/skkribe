import Foundation

@MainActor
final class TranscriptionPipeline {
    func process(fileURL: URL, appState: AppState, modelManager: ModelManager) async {
        appState.startProcessing()
        appState.fileName = fileURL.lastPathComponent

        var wavURL: URL?

        do {
            // Phase 1: Convert audio to 16kHz mono WAV
            appState.currentPhase = .preparing
            appState.progressMessage = "Convertendo audio para formato ideal..."

            wavURL = try await AudioProcessor.convertToMono16kHz(inputURL: fileURL)
            guard let wavURL else { throw SkribeError.audioConversionFailed("Falha ao converter") }

            let duration = try await AudioProcessor.getAudioDuration(url: wavURL)
            appState.audioDuration = duration
            appState.progressMessage = "Audio preparado (\(Int(duration / 60))min \(Int(duration.truncatingRemainder(dividingBy: 60)))s)"

            // Phase 2: Load audio samples and detect voice activity
            appState.currentPhase = .transcribing
            appState.progressMessage = "Carregando audio e detectando voz..."

            let audioSamples = try AudioProcessor.loadAudioAsFloatArray(url: wavURL)

            // Quick VAD pre-check: bail out early if the file is essentially silent.
            // (Real silence skipping happens inside WhisperKit via `chunkingStrategy: .vad`.)
            appState.progressMessage = "Analisando áudio..."
            let voiceSegments = VADProcessor.detectVoiceActivity(samples: audioSamples)
            let totalDuration = Double(audioSamples.count) / 16000.0
            let voiceDuration = voiceSegments.reduce(0.0) { $0 + ($1.endTime - $1.startTime) }

            if voiceDuration < 1.0 {
                throw SkribeError.audioConversionFailed("Nenhuma fala detectada no áudio")
            }

            appState.progressMessage = "Voz detectada: \(Int(voiceDuration))s de fala em \(Int(totalDuration))s totais"

            // Phase 3: Run transcription and diarization in parallel
            let capturedWavURL = wavURL
            async let whisperSegments = modelManager.transcriptionService.transcribe(audioURL: capturedWavURL)
            async let diarSegments = modelManager.diarizationService.diarize(audioSamples: audioSamples)

            appState.currentPhase = .diarizing
            appState.progressMessage = "Transcrevendo e identificando vozes em paralelo..."

            let (transcription, diarization) = try await (whisperSegments, diarSegments)

            // Phase 4: Merge transcription with speaker labels using word-level alignment
            appState.currentPhase = .merging
            appState.progressMessage = "Combinando transcricao com vozes (word-level)..."

            let merged = Self.assignSpeakersWordLevel(
                whisperSegments: transcription,
                diarSegments: diarization
            )

            let renamed = Self.renameSpeakers(segments: merged)

            // Phase 5: Translate EN → PT if needed (improved dictionary, ~5-10s for 1h audio)
            // Check if translation is needed
            let needsTranslation = renamed.first.map { TranslationService.isLikelyEnglish($0.text) } ?? false

            let final: [SkribeSegment]
            if needsTranslation {
                appState.progressMessage = "Traduzindo para portugues (dicionario expandido ~500 palavras)..."
                let translationService = ImprovedTranslationService()
                final = await translationService.translateSegments(renamed)
                appState.progressMessage = "Traducao concluida ✓ (~80% cobertura)"
            } else {
                final = renamed
            }

            appState.finishProcessing(segments: final, fileName: fileURL.lastPathComponent)

        } catch {
            appState.failProcessing(error: error.localizedDescription)
        }

        if let wavURL {
            AudioProcessor.cleanup(url: wavURL)
        }
    }

    /// Word-level speaker assignment for maximum accuracy
    private static func assignSpeakersWordLevel(
        whisperSegments: [TranscriptionService.SegmentWithWords],
        diarSegments: [DiarizationService.SpeakerSegmentResult]
    ) -> [SkribeSegment] {
        var result: [SkribeSegment] = []

        for segment in whisperSegments {
            // If segment has word-level timestamps, use them for precise alignment
            if !segment.words.isEmpty {
                // Group consecutive words by speaker
                var currentSpeaker: Int?
                var currentWords: [TranscriptionService.WordTiming] = []
                var currentStart: Double?

                for word in segment.words {
                    let wordMid = (word.start + word.end) / 2
                    let speakerId = findSpeakerAtTime(wordMid, in: diarSegments)

                    // New speaker or first word
                    if speakerId != currentSpeaker {
                        // Flush previous group
                        if !currentWords.isEmpty, let start = currentStart, let speaker = currentSpeaker {
                            let text = currentWords.map { $0.word }.joined()
                            let end = currentWords.last?.end ?? start
                            result.append(SkribeSegment(
                                start: start,
                                end: end,
                                speaker: "SPEAKER_\(speaker)",
                                text: text.trimmingCharacters(in: .whitespaces)
                            ))
                        }

                        // Start new group
                        currentSpeaker = speakerId
                        currentWords = [word]
                        currentStart = word.start
                    } else {
                        currentWords.append(word)
                    }
                }

                // Flush final group
                if !currentWords.isEmpty, let start = currentStart, let speaker = currentSpeaker {
                    let text = currentWords.map { $0.word }.joined()
                    let end = currentWords.last?.end ?? start
                    result.append(SkribeSegment(
                        start: start,
                        end: end,
                        speaker: "SPEAKER_\(speaker)",
                        text: text.trimmingCharacters(in: .whitespaces)
                    ))
                }

            } else {
                // Fallback: segment-level alignment (old behavior)
                let text = segment.text.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !text.isEmpty else { continue }

                var bestSpeakerId: Int?
                var bestOverlap: Double = 0

                for ds in diarSegments {
                    let overlap = max(0, min(segment.end, ds.end) - max(segment.start, ds.start))
                    if overlap > bestOverlap {
                        bestOverlap = overlap
                        bestSpeakerId = ds.speakerId
                    }
                }

                if bestSpeakerId == nil, !diarSegments.isEmpty {
                    let mid = (segment.start + segment.end) / 2
                    bestSpeakerId = findSpeakerAtTime(mid, in: diarSegments)
                }

                result.append(SkribeSegment(
                    start: segment.start,
                    end: segment.end,
                    speaker: "SPEAKER_\(bestSpeakerId ?? 0)",
                    text: text
                ))
            }
        }

        return result
    }

    /// Find which speaker is active at a specific timestamp
    private static func findSpeakerAtTime(_ timestamp: Double, in segments: [DiarizationService.SpeakerSegmentResult]) -> Int {
        // Find exact match (timestamp falls within segment)
        for segment in segments {
            if timestamp >= segment.start && timestamp <= segment.end {
                return segment.speakerId
            }
        }

        // Fallback: find closest segment by midpoint
        guard !segments.isEmpty else { return 0 }
        let closest = segments.min(by: { seg1, seg2 in
            let mid1 = (seg1.start + seg1.end) / 2
            let mid2 = (seg2.start + seg2.end) / 2
            return abs(timestamp - mid1) < abs(timestamp - mid2)
        })
        return closest?.speakerId ?? 0
    }

    private static func renameSpeakers(segments: [SkribeSegment]) -> [SkribeSegment] {
        var speakerMap: [String: String] = [:]
        var counter = 1

        return segments.map { seg in
            if speakerMap[seg.speaker] == nil {
                speakerMap[seg.speaker] = "Pessoa \(counter)"
                counter += 1
            }
            return SkribeSegment(
                start: seg.start,
                end: seg.end,
                speaker: speakerMap[seg.speaker]!,
                text: seg.text
            )
        }
    }
}
