import SwiftUI

struct MethodSelectionView: View {
    @ObservedObject var vm: BrewViewModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Coffee Brewer")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    Text("What are we brewing?")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal)

                VStack(spacing: 12) {
                    ForEach(BrewData.methods) { method in
                        Button {
                            vm.selectMethod(method)
                        } label: {
                            HStack(spacing: 16) {
                                Image(systemName: method.icon)
                                    .font(.title)
                                    .frame(width: 48, height: 48)
                                    .foregroundStyle(Color("CoffeeBrown"))

                                VStack(alignment: .leading, spacing: 4) {
                                    Text(method.name)
                                        .font(.headline)
                                        .foregroundStyle(.primary)
                                    Text(method.subtitle)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }

                                Spacer()

                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundStyle(.tertiary)
                            }
                            .padding(16)
                            .background(.background, in: RoundedRectangle(cornerRadius: 12))
                            .shadow(color: .black.opacity(0.06), radius: 4, y: 2)
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
}
