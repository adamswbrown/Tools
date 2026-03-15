import Foundation

/// Handles persistence of brew history and grind baselines using UserDefaults.
final class BrewStore {
    static let shared = BrewStore()

    private let defaults = UserDefaults.standard
    private let historyKey = "coffee-brewer-history"
    private let baselinesKey = "coffee-brewer-grind-baselines"
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    private init() {
        decoder.dateDecodingStrategy = .iso8601
        encoder.dateEncodingStrategy = .iso8601
    }

    // MARK: - History

    func loadHistory() -> [BrewEntry] {
        guard let data = defaults.data(forKey: historyKey),
              let entries = try? decoder.decode([BrewEntry].self, from: data) else {
            return []
        }
        return entries
    }

    func saveEntry(_ entry: BrewEntry) {
        var history = loadHistory()
        history.insert(entry, at: 0)
        if history.count > 50 { history = Array(history.prefix(50)) }
        if let data = try? encoder.encode(history) {
            defaults.set(data, forKey: historyKey)
        }
    }

    func clearHistory() {
        defaults.removeObject(forKey: historyKey)
    }

    // MARK: - Grind Baselines

    func loadBaselines() -> [String: Int] {
        guard let data = defaults.data(forKey: baselinesKey),
              let baselines = try? decoder.decode([String: Int].self, from: data) else {
            return defaultBaselines()
        }
        return baselines
    }

    func saveBaselines(_ baselines: [String: Int]) {
        if let data = try? encoder.encode(baselines) {
            defaults.set(data, forKey: baselinesKey)
        }
    }

    func grind(for methodId: String) -> Int {
        loadBaselines()[methodId] ?? (BrewData.method(for: methodId)?.defaultGrind ?? 20)
    }

    func setGrind(_ value: Int, for methodId: String) {
        var baselines = loadBaselines()
        baselines[methodId] = value
        saveBaselines(baselines)
    }

    func resetBaselines() {
        saveBaselines(defaultBaselines())
    }

    private func defaultBaselines() -> [String: Int] {
        var baselines: [String: Int] = [:]
        for method in BrewData.methods {
            baselines[method.id] = method.defaultGrind
        }
        return baselines
    }
}
