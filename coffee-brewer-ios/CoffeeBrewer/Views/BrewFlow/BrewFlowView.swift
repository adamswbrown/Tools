import SwiftUI

struct BrewFlowView: View {
    @ObservedObject var vm: BrewViewModel

    var body: some View {
        NavigationStack {
            Group {
                switch vm.phase {
                case .selectMethod:
                    MethodSelectionView(vm: vm)
                case .selectPeople:
                    PeopleSelectionView(vm: vm)
                case .recipe:
                    RecipeView(vm: vm)
                case .brewing:
                    TimerView(vm: vm)
                case .feedback:
                    TasteFeedbackView(vm: vm)
                case .result:
                    ResultView(vm: vm)
                }
            }
            .animation(.easeInOut(duration: 0.2), value: vm.phase)
        }
    }
}
