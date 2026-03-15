import SwiftUI

struct RecipeView: View {
    @ObservedObject var vm: BrewViewModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 4) {
                    Button {
                        vm.goBack()
                    } label: {
                        Label("Back", systemImage: "chevron.left")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                    }
                    .tint(Color("CoffeeBrown"))

                    Text(vm.selectedMethod?.name ?? "")
                        .font(.title2)
                        .fontWeight(.bold)
                }
                .padding(.horizontal)

                // Amounts
                HStack {
                    RecipeAmountView(value: "\(vm.currentGrind)", label: "GRIND")
                    RecipeAmountView(value: "\(vm.serving.coffee)g", label: "COFFEE")
                    RecipeAmountView(value: "\(vm.serving.water)ml", label: "WATER")
                }
                .padding()
                .background(.background, in: RoundedRectangle(cornerRadius: 12))
                .shadow(color: .black.opacity(0.06), radius: 4, y: 2)
                .padding(.horizontal)

                // Steps
                VStack(alignment: .leading, spacing: 0) {
                    if let method = vm.selectedMethod {
                        ForEach(Array(method.steps.enumerated()), id: \.offset) { index, step in
                            HStack(alignment: .top, spacing: 12) {
                                Text("\(index + 1)")
                                    .font(.caption)
                                    .fontWeight(.bold)
                                    .foregroundStyle(.white)
                                    .frame(width: 24, height: 24)
                                    .background(Color("CoffeeBrown"), in: Circle())

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(step.label)
                                        .font(.subheadline)
                                    if step.duration > 0 {
                                        Text(BrewViewModel.formatTime(step.duration))
                                            .font(.caption)
                                            .fontWeight(.semibold)
                                            .foregroundStyle(Color("CoffeeBrown"))
                                    }
                                }
                            }
                            .padding(.vertical, 10)

                            if index < method.steps.count - 1 {
                                Divider().padding(.leading, 36)
                            }
                        }
                    }
                }
                .padding()
                .background(.background, in: RoundedRectangle(cornerRadius: 12))
                .shadow(color: .black.opacity(0.06), radius: 4, y: 2)
                .padding(.horizontal)

                // Start button
                Button {
                    vm.startBrewing()
                } label: {
                    Text("Start Brewing")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color("CoffeeBrown"))
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .padding(.horizontal)
            }
            .padding(.top)
        }
        .background(Color("CreamBG"))
    }
}

struct RecipeAmountView: View {
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundStyle(Color("CoffeeBrown"))
            Text(label)
                .font(.caption2)
                .fontWeight(.medium)
                .foregroundStyle(.secondary)
                .tracking(0.5)
        }
        .frame(maxWidth: .infinity)
    }
}
