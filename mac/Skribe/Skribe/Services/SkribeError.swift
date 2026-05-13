import Foundation

enum SkribeError: LocalizedError {
    case audioConversionFailed(String)
    case modelNotLoaded
    case transcriptionFailed(String)
    case diarizationFailed(String)
    case translationFailed(String)
    case noAudioTrack
    case fileNotFound

    var errorDescription: String? {
        switch self {
        case .audioConversionFailed(let msg): "Erro na conversao do audio: \(msg)"
        case .modelNotLoaded: "Modelo de IA nao carregado. Tente novamente."
        case .transcriptionFailed(let msg): "Erro na transcricao: \(msg)"
        case .diarizationFailed(let msg): "Erro na diarizacao: \(msg)"
        case .translationFailed(let msg): "Erro na traducao: \(msg)"
        case .noAudioTrack: "Nenhuma trilha de audio encontrada no arquivo."
        case .fileNotFound: "Arquivo nao encontrado."
        }
    }
}
