import AVFoundation
import Foundation

struct AudioProcessor {
    static func convertToMono16kHz(inputURL: URL) async throws -> URL {
        let tmpDir = FileManager.default.temporaryDirectory
        let outputURL = tmpDir.appendingPathComponent("skribe_\(UUID().uuidString).wav")

        let asset = AVURLAsset(url: inputURL)
        let audioTracks = try await asset.loadTracks(withMediaType: .audio)
        guard let track = audioTracks.first else {
            throw SkribeError.audioConversionFailed("Arquivo nao contem trilha de audio")
        }

        let reader = try AVAssetReader(asset: asset)
        let readerSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: 16000,
            AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 32,
            AVLinearPCMIsFloatKey: true,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false
        ]
        let readerOutput = AVAssetReaderTrackOutput(track: track, outputSettings: readerSettings)
        readerOutput.alwaysCopiesSampleData = false
        guard reader.canAdd(readerOutput) else {
            throw SkribeError.audioConversionFailed("Nao foi possivel adicionar saida ao leitor")
        }
        reader.add(readerOutput)

        let outputSettings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatLinearPCM),
            AVSampleRateKey: 16000,
            AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsBigEndianKey: false
        ]
        let outputFile = try AVAudioFile(forWriting: outputURL, settings: outputSettings)
        let outputFormat = outputFile.processingFormat

        guard let inputFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: 16000,
            channels: 1,
            interleaved: false
        ) else {
            throw SkribeError.audioConversionFailed("Nao foi possivel criar formato de entrada")
        }

        guard reader.startReading() else {
            throw SkribeError.audioConversionFailed(reader.error?.localizedDescription ?? "Falha ao iniciar leitura")
        }

        while let sampleBuffer = readerOutput.copyNextSampleBuffer() {
            defer { CMSampleBufferInvalidate(sampleBuffer) }
            guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { continue }
            let frameCount = AVAudioFrameCount(CMSampleBufferGetNumSamples(sampleBuffer))
            if frameCount == 0 { continue }

            guard let pcmBuffer = AVAudioPCMBuffer(pcmFormat: inputFormat, frameCapacity: frameCount) else {
                throw SkribeError.audioConversionFailed("Nao foi possivel alocar buffer PCM")
            }
            pcmBuffer.frameLength = frameCount

            var lengthAtOffset = 0
            var totalLength = 0
            var dataPointer: UnsafeMutablePointer<Int8>?
            let status = CMBlockBufferGetDataPointer(
                blockBuffer,
                atOffset: 0,
                lengthAtOffsetOut: &lengthAtOffset,
                totalLengthOut: &totalLength,
                dataPointerOut: &dataPointer
            )
            if status != kCMBlockBufferNoErr || dataPointer == nil { continue }

            dataPointer!.withMemoryRebound(to: Float.self, capacity: Int(frameCount)) { src in
                pcmBuffer.floatChannelData![0].update(from: src, count: Int(frameCount))
            }

            // Convert Float32 -> Int16 PCM via AVAudioFile (it handles internally)
            let writeBuffer = try? convertFloatToInt16(pcmBuffer, outputFormat: outputFormat)
            if let writeBuffer = writeBuffer {
                try outputFile.write(from: writeBuffer)
            }
        }

        if reader.status == .failed {
            throw SkribeError.audioConversionFailed(reader.error?.localizedDescription ?? "Falha ao ler audio")
        }

        return outputURL
    }

    private static func convertFloatToInt16(_ input: AVAudioPCMBuffer, outputFormat: AVAudioFormat) throws -> AVAudioPCMBuffer {
        guard let converter = AVAudioConverter(from: input.format, to: outputFormat),
              let output = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: input.frameLength) else {
            throw SkribeError.audioConversionFailed("Nao foi possivel converter para Int16")
        }
        var error: NSError?
        var supplied = false
        converter.convert(to: output, error: &error) { _, outStatus in
            if supplied {
                outStatus.pointee = .endOfStream
                return nil
            }
            supplied = true
            outStatus.pointee = .haveData
            return input
        }
        if let error = error { throw error }
        return output
    }

    static func loadAudioAsFloatArray(url: URL) throws -> [Float] {
        // AVAudioFile read mode uses Float32 non-interleaved as processing format automatically
        let inputFile = try AVAudioFile(forReading: url)
        let frameCount = AVAudioFrameCount(inputFile.length)

        guard let buffer = AVAudioPCMBuffer(pcmFormat: inputFile.processingFormat, frameCapacity: frameCount) else {
            throw SkribeError.audioConversionFailed("Nao foi possivel criar buffer de audio")
        }

        try inputFile.read(into: buffer)

        guard let channelData = buffer.floatChannelData?[0] else {
            throw SkribeError.audioConversionFailed("Sem dados de audio no buffer")
        }

        return Array(UnsafeBufferPointer(start: channelData, count: Int(buffer.frameLength)))
    }

    static func getAudioDuration(url: URL) async throws -> Double {
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration)
        return CMTimeGetSeconds(duration)
    }

    static func cleanup(url: URL) {
        try? FileManager.default.removeItem(at: url)
    }
}
