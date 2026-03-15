import SwiftUI

struct SettingsView: View {
    @ObservedObject var vm: BrewViewModel

    var body: some View {
        NavigationStack {
            List {
                Section("Current Baratza Encore Baselines") {
                    ForEach(BrewData.methods) { method in
                        let current = vm.baselines[method.id] ?? method.defaultGrind
                        let isDefault = current == method.defaultGrind

                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(method.name)
                                    .font(.headline)
                                if !isDefault {
                                    Text("Default: \(method.defaultGrind)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }

                            Spacer()

                            HStack(spacing: 14) {
                                Button {
                                    vm.adjustGrind(for: method.id, by: -1)
                                } label: {
                                    Image(systemName: "minus")
                                        .font(.body.weight(.bold))
                                        .frame(width: 36, height: 36)
                                        .background(Color("CoffeeBrown").opacity(0.1), in: Circle())
                                        .foregroundStyle(Color("CoffeeBrown"))
                                }
                                .buttonStyle(.plain)

                                Text("\(current)")
                                    .font(.system(size: 22, weight: .bold, design: .rounded))
                                    .foregroundStyle(Color("CoffeeBrown"))
                                    .frame(minWidth: 36)

                                Button {
                                    vm.adjustGrind(for: method.id, by: 1)
                                } label: {
                                    Image(systemName: "plus")
                                        .font(.body.weight(.bold))
                                        .frame(width: 36, height: 36)
                                        .background(Color("CoffeeBrown").opacity(0.1), in: Circle())
                                        .foregroundStyle(Color("CoffeeBrown"))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                Section {
                    Button("Reset to Defaults") {
                        vm.resetGrindBaselines()
                    }
                    .foregroundStyle(.red)
                }
            }
            .navigationTitle("Grind Settings")
        }
    }
}
