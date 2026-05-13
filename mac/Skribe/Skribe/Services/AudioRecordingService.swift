import Foundation
import AVFoundation

final class AudioRecordingService: NSObject, @unchecked Sendable {
    private var audioRecorder: AVAudioRecorder?
    private var startTime: Date?
    private var recordingURL: URL?

    func startRecording() throws -> URL {
        // Cria arquivo de saída
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let fileName = "recording_\(Date().timeIntervalSince1970).m4a"
        let url = documentsPath.appendingPathComponent(fileName)
        recordingURL = url

        // Configura gravador (sem AVAudioSession - macOS não precisa)
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 16000.0,
            AVNumberOfChannelsKey: 2,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        audioRecorder = try AVAudioRecorder(url: url, settings: settings)
        audioRecorder?.delegate = self

        guard audioRecorder?.record() == true else {
            throw NSError(domain: "AudioRecording", code: -1, userInfo: [NSLocalizedDescriptionKey: "Não foi possível iniciar a gravação"])
        }

        startTime = Date()
        return url
    }

    func stopRecording() async {
        audioRecorder?.stop()
        audioRecorder = nil
    }

    func getRecordingDuration() -> TimeInterval {
        guard let startTime = startTime else { return 0 }
        return Date().timeIntervalSince(startTime)
    }
}

extension AudioRecordingService: AVAudioRecorderDelegate {
    func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        print("Gravação finalizada: \(flag)")
    }

    func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        print("Erro de gravação: \(error?.localizedDescription ?? "desconhecido")")
    }
}
