import Foundation

// MARK: - Brew Method

struct BrewMethod: Identifiable {
    let id: String
    let name: String
    let subtitle: String
    let icon: String
    let defaultGrind: Int
    let steps: [BrewStep]
}

struct BrewStep: Identifiable {
    let id = UUID()
    let label: String
    let duration: Int // seconds, 0 = manual step
}

// MARK: - Serving

struct Serving {
    let people: Int
    let coffee: Int  // grams
    let water: Int   // ml
}

// MARK: - Taste

enum TasteResult: String, Codable, CaseIterable {
    case sour
    case balanced
    case bitter

    var label: String {
        switch self {
        case .sour: return "Sour / Thin"
        case .balanced: return "Balanced / Sweet"
        case .bitter: return "Bitter / Harsh"
        }
    }

    var description: String {
        switch self {
        case .sour: return "Sharp, acidic, watery"
        case .balanced: return "Smooth, flavourful, just right"
        case .bitter: return "Dry, astringent, over-extracted"
        }
    }

    var emoji: String {
        switch self {
        case .sour: return "😐"
        case .balanced: return "😊"
        case .bitter: return "😬"
        }
    }

    var grindAdjustment: Int {
        switch self {
        case .sour: return -1
        case .balanced: return 0
        case .bitter: return 1
        }
    }

    var advice: String {
        switch self {
        case .sour: return "Under-extracted. Try one click finer (lower number) next time."
        case .balanced: return "Perfect extraction! Keep this grind setting."
        case .bitter: return "Over-extracted. Try one click coarser (higher number) next time."
        }
    }
}

// MARK: - Brew History Entry

struct BrewEntry: Identifiable, Codable {
    let id: String
    let date: Date
    let methodId: String
    let methodName: String
    let people: Int
    let grindSetting: Int
    let coffeeGrams: Int
    let waterMl: Int
    let taste: TasteResult
    let grindAdjustment: Int
}

// MARK: - Static Data

enum BrewData {
    static let methods: [BrewMethod] = [
        BrewMethod(
            id: "clever",
            name: "Clever Dripper",
            subtitle: "Immersion + filter · 3 min steep",
            icon: "cup.and.saucer.fill",
            defaultGrind: 19,
            steps: [
                BrewStep(label: "Rinse paper filter with hot water", duration: 0),
                BrewStep(label: "Add hot water first (just off boil, ~30s after)", duration: 0),
                BrewStep(label: "Add coffee grounds", duration: 0),
                BrewStep(label: "Stir gently once", duration: 0),
                BrewStep(label: "Put lid on and steep", duration: 180),
                BrewStep(label: "Place on cup/carafe and let it drain", duration: 0)
            ]
        ),
        BrewMethod(
            id: "french",
            name: "French Press",
            subtitle: "Hoffmann method · ~10 min",
            icon: "mug.fill",
            defaultGrind: 27,
            steps: [
                BrewStep(label: "Add coffee grounds to press", duration: 0),
                BrewStep(label: "Pour in all the water", duration: 0),
                BrewStep(label: "Stir gently, then wait", duration: 240),
                BrewStep(label: "Break the crust with a spoon, scoop off foam", duration: 0),
                BrewStep(label: "Wait quietly (do not press yet)", duration: 360),
                BrewStep(label: "Press gently and pour immediately", duration: 0)
            ]
        ),
        BrewMethod(
            id: "aromaboy",
            name: "Aromaboy",
            subtitle: "Filter drip machine",
            icon: "coffeemaker.fill",
            defaultGrind: 21,
            steps: [
                BrewStep(label: "Add filter paper and rinse with water", duration: 0),
                BrewStep(label: "Add coffee grounds to filter", duration: 0),
                BrewStep(label: "Add water to reservoir", duration: 0),
                BrewStep(label: "Turn on and wait for brew to complete", duration: 0)
            ]
        )
    ]

    static let servings: [Serving] = [
        Serving(people: 1, coffee: 18, water: 300),
        Serving(people: 2, coffee: 36, water: 600),
        Serving(people: 3, coffee: 54, water: 900)
    ]

    static func method(for id: String) -> BrewMethod? {
        methods.first { $0.id == id }
    }

    static func serving(for people: Int) -> Serving? {
        servings.first { $0.people == people }
    }
}
