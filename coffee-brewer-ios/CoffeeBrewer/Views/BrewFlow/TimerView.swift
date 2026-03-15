import SwiftUI

struct TimerView: View {
    @ObservedObject var vm: BrewViewModel

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            // Step label
            if let step = vm.currentStep {
                Text(step.label)
                    .font(.headline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            // Timer display
            if let step = vm.currentStep, step.duration > 0 {
                Text(BrewViewModel.formatTime(vm.timerRemaining))
                    .font(.system(size: 72, weight: .bold, design: .rounded))
                    .foregroundStyle(vm.timerDone ? Color.green : Color("CoffeeBrown"))
                    .contentTransition(.numericText())
                    .animation(.linear(duration: 0.1), value: vm.timerRemaining)
            } else {
                Text("--:--")
                    .font(.system(size: 72, weight: .bold, design: .rounded))
                    .foregroundStyle(Color("CoffeeBrown").opacity(0.3))
            }

            // Progress dots
            HStack(spacing: 8) {
                ForEach(0..<vm.totalSteps, id: \.self) { index in
                    Circle()
                        .fill(dotColor(for: index))
                        .frame(width: 10, height: 10)
                }
            }

            Spacer()

            // Buttons
            VStack(spacing: 10) {
                if vm.timerDone || (vm.currentStep?.duration ?? 0) == 0 {
                    Button {
                        vm.nextStep()
                    } label: {
                        Text(vm.isLastStep ? "Done" : "Next Step")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color("CoffeeBrown"))
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }

                if vm.timerRunning {
                    Button {
                        vm.skipTimer()
                    } label: {
                        Text("Skip Timer")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                            .padding()
                    }
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 32)
        }
        .background(Color("CreamBG"))
    }

    private func dotColor(for index: Int) -> Color {
        if index < vm.currentStepIndex {
            return .green
        } else if index == vm.currentStepIndex {
            return Color("CoffeeBrown")
        } else {
            return Color("CoffeeBrown").opacity(0.2)
        }
    }
}
