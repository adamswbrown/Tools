import SwiftUI

struct TasteFeedbackView: View {
    @ObservedObject var vm: BrewViewModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("How did it taste?")
                        .font(.title2)
                        .fontWeight(.bold)
                    Text("This helps adjust your grind")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal)

                VStack(spacing: 12) {
                    ForEach(TasteResult.allCases, id: \.self) { taste in
                        Button {
                            vm.recordTaste(taste)
                        } label: {
                            VStack(spacing: 6) {
                                Text(taste.emoji)
                                    .font(.system(size: 32))
                                Text(taste.label)
                                    .font(.headline)
                                    .foregroundStyle(.primary)
                                Text(taste.description)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 18)
                            .background(tasteBackground(taste), in: RoundedRectangle(cornerRadius: 12))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(tasteBorder(taste), lineWidth: 2)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal)
            }
            .padding(.top)
        }
        .background(Color("CreamBG"))
    }

    private func tasteBackground(_ taste: TasteResult) -> Color {
        switch taste {
        case .sour: return Color.orange.opacity(0.06)
        case .balanced: return Color.green.opacity(0.06)
        case .bitter: return Color.red.opacity(0.06)
        }
    }

    private func tasteBorder(_ taste: TasteResult) -> Color {
        switch taste {
        case .sour: return Color.orange.opacity(0.3)
        case .balanced: return Color.green.opacity(0.3)
        case .bitter: return Color.red.opacity(0.3)
        }
    }
}
