import Foundation

struct SkribeSegment: Identifiable, Equatable {
    let id = UUID()
    let start: Double
    let end: Double
    let speaker: String
    let text: String

    var formattedStart: String {
        let m = Int(start) / 60
        let s = Int(start) % 60
        return String(format: "%02d:%02d", m, s)
    }

    var formattedEnd: String {
        let m = Int(end) / 60
        let s = Int(end) % 60
        return String(format: "%02d:%02d", m, s)
    }
}
