import Foundation
import AVFoundation
import UIKit
import Combine

/// Manages the brew flow state, timer, and persistence.
@MainActor
final class BrewViewModel: ObservableObject {

    // MARK: - Brew Flow State

    enum BrewPhase: Equatable {
        case selectMethod
        case selectPeople
        case recipe
        case brewing
        case feedback
        case result
    }

    @Published var phase: BrewPhase = .selectMethod
    @Published var selectedMethod: BrewMethod?
    @Published var selectedPeople: Int = 2
    @Published var currentStepIndex: Int = 0

    // MARK: - Timer State

    @Published var timerRemaining: Int = 0
    @Published var timerRunning: Bool = false
    @Published var timerDone: Bool = false

    private var timerEndDate: Date?
    private var timerCancellable: AnyCancellable?

    // MARK: - Result State

    @Published var lastTaste: TasteResult?
    @Published var lastGrindBefore: Int = 0
    @Published var lastGrindAfter: Int = 0

    // MARK: - Data

    @Published var history: [BrewEntry] = []
    @Published var baselines: [String: Int] = [:]

    private let store = BrewStore.shared

    init() {
        history = store.loadHistory()
        baselines = store.loadBaselines()
    }

    // MARK: - Computed

    var serving: Serving {
        BrewData.serving(for: selectedPeople) ?? BrewData.servings[1]
    }

    var currentGrind: Int {
        guard let method = selectedMethod else { return 20 }
        return baselines[method.id] ?? method.defaultGrind
    }

    var currentStep: BrewStep? {
        guard let method = selectedMethod,
              currentStepIndex < method.steps.count else { return nil }
        return method.steps[currentStepIndex]
    }

    var isLastStep: Bool {
        guard let method = selectedMethod else { return true }
        return currentStepIndex >= method.steps.count - 1
    }

    var totalSteps: Int {
        selectedMethod?.steps.count ?? 0
    }

    // MARK: - Flow Actions

    func selectMethod(_ method: BrewMethod) {
        selectedMethod = method
        phase = .selectPeople
    }

    func selectPeople(_ count: Int) {
        selectedPeople = count
        phase = .recipe
    }

    func startBrewing() {
        currentStepIndex = 0
        timerDone = false
        phase = .brewing
        startStep()
    }

    func nextStep() {
        stopTimer()
        if isLastStep {
            phase = .feedback
        } else {
            currentStepIndex += 1
            timerDone = false
            startStep()
        }
    }

    func skipTimer() {
        stopTimer()
        nextStep()
    }

    func goBack() {
        stopTimer()
        switch phase {
        case .selectPeople: phase = .selectMethod
        case .recipe: phase = .selectPeople
        default: phase = .selectMethod
        }
    }

    func reset() {
        stopTimer()
        selectedMethod = nil
        selectedPeople = 2
        currentStepIndex = 0
        timerDone = false
        lastTaste = nil
        phase = .selectMethod
    }

    // MARK: - Timer

    private func startStep() {
        guard let step = currentStep else { return }
        if step.duration > 0 {
            startTimer(seconds: step.duration)
        } else {
            timerRunning = false
            timerRemaining = 0
            timerDone = false
        }
    }

    private func startTimer(seconds: Int) {
        timerRemaining = seconds
        timerRunning = true
        timerDone = false
        timerEndDate = Date().addingTimeInterval(TimeInterval(seconds))

        timerCancellable = Timer.publish(every: 0.25, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.tickTimer()
            }
    }

    private func tickTimer() {
        guard let endDate = timerEndDate else { return }
        let remaining = max(0, Int(ceil(endDate.timeIntervalSinceNow)))
        timerRemaining = remaining

        if remaining <= 0 {
            stopTimer()
            timerDone = true
            playCompletionAlert()
        }
    }

    private func stopTimer() {
        timerCancellable?.cancel()
        timerCancellable = nil
        timerRunning = false
        timerEndDate = nil
    }

    // MARK: - Taste Feedback

    func recordTaste(_ taste: TasteResult) {
        guard let method = selectedMethod else { return }
        let grindBefore = currentGrind
        let adjustment = taste.grindAdjustment

        // Save to history
        let entry = BrewEntry(
            id: UUID().uuidString,
            date: Date(),
            methodId: method.id,
            methodName: method.name,
            people: selectedPeople,
            grindSetting: grindBefore,
            coffeeGrams: serving.coffee,
            waterMl: serving.water,
            taste: taste,
            grindAdjustment: adjustment
        )
        store.saveEntry(entry)
        history = store.loadHistory()

        // Adjust grind baseline
        if adjustment != 0 {
            let newGrind = grindBefore + adjustment
            store.setGrind(newGrind, for: method.id)
            baselines = store.loadBaselines()
        }

        // Set result state
        lastTaste = taste
        lastGrindBefore = grindBefore
        lastGrindAfter = grindBefore + adjustment
        phase = .result
    }

    // MARK: - Settings

    func adjustGrind(for methodId: String, by delta: Int) {
        let current = baselines[methodId] ?? (BrewData.method(for: methodId)?.defaultGrind ?? 20)
        let clamped = max(1, min(40, current + delta))
        store.setGrind(clamped, for: methodId)
        baselines = store.loadBaselines()
    }

    func resetGrindBaselines() {
        store.resetBaselines()
        baselines = store.loadBaselines()
    }

    func clearHistory() {
        store.clearHistory()
        history = []
    }

    // MARK: - Audio & Haptics

    private func playCompletionAlert() {
        // Haptic feedback
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)

        // System sound
        AudioServicesPlaySystemSound(1005) // 3-tone alert
    }

    // MARK: - Helpers

    static func formatTime(_ totalSeconds: Int) -> String {
        let m = totalSeconds / 60
        let s = totalSeconds % 60
        return String(format: "%d:%02d", m, s)
    }
}
