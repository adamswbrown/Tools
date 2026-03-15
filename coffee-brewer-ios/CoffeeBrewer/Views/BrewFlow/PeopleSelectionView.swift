import SwiftUI

struct PeopleSelectionView: View {
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
                    Text("How many people?")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal)

                HStack(spacing: 12) {
                    ForEach(BrewData.servings, id: \.people) { serving in
                        Button {
                            vm.selectPeople(serving.people)
                        } label: {
                            VStack(spacing: 10) {
                                Text("\(serving.people)")
                                    .font(.system(size: 36, weight: .bold, design: .rounded))
                                    .foregroundStyle(Color("CoffeeBrown"))

                                VStack(spacing: 2) {
                                    Text("\(serving.coffee)g coffee")
                                        .font(.caption2)
                                    Text("\(serving.water)ml water")
                                        .font(.caption2)
                                }
                                .foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 20)
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
