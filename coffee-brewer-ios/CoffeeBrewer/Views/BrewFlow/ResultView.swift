import SwiftUI

struct ResultView: View {
    @ObservedObject var vm: BrewViewModel

    var body: some View {
        VStack(spacing: 16) {
            Spacer()

            Text(resultIcon)
                .font(.system(size: 56))

            Text("Brew Saved!")
                .font(.title2)
                .fontWeight(.bold)

            Text(grindMessage)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            if let taste = vm.lastTaste {
                Text(taste.advice)
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .padding()
                    .frame(maxWidth: 300)
                    .background(.background, in: RoundedRectangle(cornerRadius: 12))
                    .shadow(color: .black.opacity(0.06), radius: 4, y: 2)
            }

            Spacer()

            Button {
                vm.reset()
            } label: {
                Text("Brew Again")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color("CoffeeBrown"))
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .padding(.horizontal)
            .padding(.bottom, 32)
        }
        .background(Color("CreamBG"))
    }

    private var resultIcon: String {
        switch vm.lastTaste {
        case .balanced: return "✅"
        case .sour, .bitter: return "⚠️"
        case .none: return "☕️"
        }
    }

    private var grindMessage: String {
        if vm.lastGrindBefore == vm.lastGrindAfter {
            return "Grind stays at \(vm.lastGrindBefore) — nice!"
        } else {
            return "Grind adjusted: \(vm.lastGrindBefore) → \(vm.lastGrindAfter)"
        }
    }
}
