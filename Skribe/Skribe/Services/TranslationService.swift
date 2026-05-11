import Foundation
import NaturalLanguage

/// Fast local translation EN → PT
/// Uses a hybrid approach: NLLanguageRecognizer + simple dictionary
final class TranslationService: @unchecked Sendable {

    /// EN→PT dictionary for common meeting/business words
    private static let dictionary: [String: String] = [
        // Pronouns & basic
        "i": "eu", "you": "você", "he": "ele", "she": "ela", "we": "nós", "they": "eles",
        "my": "meu", "your": "seu", "his": "dele", "her": "dela", "our": "nosso", "their": "deles",
        "this": "este", "that": "aquele", "these": "estes", "those": "aqueles",

        // Common verbs
        "is": "é", "are": "são", "was": "foi", "were": "eram", "be": "ser",
        "have": "ter", "has": "tem", "had": "tinha",
        "do": "fazer", "does": "faz", "did": "fez", "done": "feito",
        "will": "vai", "would": "gostaria", "can": "pode", "could": "poderia",
        "should": "deveria", "must": "deve", "may": "pode", "might": "poderia",
        "go": "ir", "goes": "vai", "went": "foi", "going": "indo",
        "get": "obter", "gets": "obtém", "got": "obteve", "getting": "obtendo",
        "make": "fazer", "makes": "faz", "made": "fez", "making": "fazendo",
        "think": "pensar", "thinks": "pensa", "thought": "pensou",
        "know": "saber", "knows": "sabe", "knew": "sabia",
        "say": "dizer", "says": "diz", "said": "disse",
        "see": "ver", "sees": "vê", "saw": "viu",
        "want": "querer", "wants": "quer", "wanted": "quis",
        "need": "precisar", "needs": "precisa", "needed": "precisou",
        "like": "gostar", "likes": "gosta", "liked": "gostou",

        // Common nouns
        "meeting": "reunião", "call": "chamada", "discussion": "discussão",
        "person": "pessoa", "people": "pessoas", "team": "equipe", "group": "grupo",
        "time": "tempo", "day": "dia", "week": "semana", "month": "mês", "year": "ano",
        "today": "hoje", "tomorrow": "amanhã", "yesterday": "ontem",
        "thing": "coisa", "things": "coisas", "stuff": "coisas",
        "way": "maneira", "ways": "maneiras",
        "work": "trabalho", "job": "trabalho", "project": "projeto",
        "problem": "problema", "issue": "questão", "question": "pergunta",
        "idea": "ideia", "solution": "solução", "answer": "resposta",
        "point": "ponto", "part": "parte", "case": "caso",
        "example": "exemplo", "moment": "momento", "place": "lugar",

        // Common adjectives
        "good": "bom", "bad": "ruim", "great": "ótimo", "okay": "ok",
        "new": "novo", "old": "velho", "different": "diferente", "same": "mesmo",
        "important": "importante", "big": "grande", "small": "pequeno",
        "first": "primeiro", "last": "último", "next": "próximo",
        "right": "certo", "wrong": "errado", "sure": "certo",

        // Common adverbs
        "now": "agora", "then": "então", "here": "aqui", "there": "lá",
        "very": "muito", "really": "realmente", "just": "apenas", "only": "só",
        "also": "também", "too": "também", "well": "bem",
        "maybe": "talvez", "probably": "provavelmente",

        // Common prepositions & conjunctions
        "in": "em", "on": "em", "at": "em", "to": "para", "for": "para",
        "with": "com", "from": "de", "about": "sobre", "by": "por",
        "and": "e", "or": "ou", "but": "mas", "if": "se", "when": "quando",
        "because": "porque", "so": "então", "than": "que",

        // Questions
        "what": "o que", "where": "onde", "when": "quando", "why": "por que",
        "how": "como", "who": "quem", "which": "qual",

        // Common expressions
        "yes": "sim", "no": "não", "okay": "ok", "please": "por favor",
        "thank": "obrigado", "thanks": "obrigado", "sorry": "desculpe",

        // Numbers
        "one": "um", "two": "dois", "three": "três", "four": "quatro", "five": "cinco",
        "six": "seis", "seven": "sete", "eight": "oito", "nine": "nove", "ten": "dez"
    ]

    /// Translate segments from EN to PT (best-effort, very fast)
    func translateSegments(_ segments: [SkribeSegment]) async -> [SkribeSegment] {
        return segments.map { segment in
            let translated = translateText(segment.text)
            return SkribeSegment(
                start: segment.start,
                end: segment.end,
                speaker: segment.speaker,
                text: translated
            )
        }
    }

    /// Translate text using dictionary + heuristics
    private func translateText(_ text: String) -> String {
        let words = text.components(separatedBy: " ")
        var translated: [String] = []

        for word in words {
            // Simple cleaning: remove common punctuation for lookup
            let cleanWord = word
                .trimmingCharacters(in: CharacterSet(charactersIn: ".,!?;:\"'"))
                .lowercased()

            // Try translation
            if let translation = Self.dictionary[cleanWord] {
                // Preserve capitalization from original
                var finalWord = translation
                if word.first?.isUppercase == true {
                    finalWord = finalWord.prefix(1).uppercased() + finalWord.dropFirst()
                }

                // Preserve punctuation (simple: add back if original had trailing punct)
                if word.last?.isPunctuation == true, let lastChar = word.last {
                    finalWord += String(lastChar)
                }

                translated.append(finalWord)
            } else {
                // Keep original if not in dictionary
                translated.append(word)
            }
        }

        return translated.joined(separator: " ")
    }

    /// Check if text is likely English (quick heuristic)
    static func isLikelyEnglish(_ text: String) -> Bool {
        let recognizer = NLLanguageRecognizer()
        recognizer.processString(text)

        if let language = recognizer.dominantLanguage {
            return language == .english
        }

        // Fallback: check for common English words
        let lowercased = text.lowercased()
        let englishIndicators = ["the ", " is ", " are ", " and ", " to ", " of "]
        return englishIndicators.contains { lowercased.contains($0) }
    }
}
