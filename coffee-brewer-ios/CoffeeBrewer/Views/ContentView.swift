import SwiftUI

struct ContentView: View {
    @StateObject private var vm = BrewViewModel()

    var body: some View {
        TabView {
            BrewFlowView(vm: vm)
                .tabItem {
                    Label("Brew", systemImage: "cup.and.saucer.fill")
                }

            HistoryView(vm: vm)
                .tabItem {
                    Label("History", systemImage: "clock.fill")
                }

            SettingsView(vm: vm)
                .tabItem {
                    Label("Grind", systemImage: "gearshape.fill")
                }
        }
        .tint(Color("CoffeeBrown"))
    }
}
