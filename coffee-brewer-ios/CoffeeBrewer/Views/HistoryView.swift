import SwiftUI

struct HistoryView: View {
    @ObservedObject var vm: BrewViewModel

    var body: some View {
        NavigationStack {
            Group {
                if vm.history.isEmpty {
                    ContentUnavailableView(
                        "No Brews Yet",
                        systemImage: "cup.and.saucer",
                        description: Text("Go make some coffee!")
                    )
                } else {
                    List {
                        ForEach(vm.history.prefix(20)) { entry in
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(entry.methodName)
                                        .font(.headline)
                                    Text(formatDetail(entry))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }

                                Spacer()

                                TasteBadge(taste: entry.taste)
                            }
                            .padding(.vertical, 4)
                        }

                        Section {
                            Button("Clear History", role: .destructive) {
                                vm.clearHistory()
                            }
                        }
                    }
                }
            }
            .navigationTitle("Brew History")
        }
    }

    private func formatDetail(_ entry: BrewEntry) -> String {
        let dateStr = entry.date.formatted(date: .abbreviated, time: .omitted)
        return "\(dateStr) · \(entry.people)p · Grind \(entry.grindSetting) · \(entry.coffeeGrams)g / \(entry.waterMl)ml"
    }
}

struct TasteBadge: View {
    let taste: TasteResult

    var body: some View {
        Text(taste.label.components(separatedBy: " / ").first ?? taste.rawValue)
            .font(.caption2)
            .fontWeight(.semibold)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(badgeColor.opacity(0.15), in: Capsule())
            .foregroundStyle(badgeColor)
    }

    private var badgeColor: Color {
        switch taste {
        case .sour: return .orange
        case .balanced: return .green
        case .bitter: return .red
        }
    }
}
