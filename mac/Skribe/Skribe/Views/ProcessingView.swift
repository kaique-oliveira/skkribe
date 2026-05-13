import SwiftUI

struct ProcessingView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: appState.currentPhase.icon)
                .font(.system(size: 44))
                .foregroundStyle(.purple)
                .symbolEffect(.pulse, isActive: true)

            Text(appState.currentPhase.label)
                .font(.title3.weight(.semibold))
                .foregroundStyle(.white)

            Text(appState.currentPhase.detail)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            // Phase steps
            HStack(spacing: 4) {
                ForEach(ProcessingPhase.allCases, id: \.rawValue) { phase in
                    PhaseStep(
                        phase: phase,
                        currentPhase: appState.currentPhase
                    )
                }
            }
            .padding(.horizontal, 40)

            // Timer
            HStack(spacing: 6) {
                Image(systemName: "timer")
                    .font(.caption)
                Text(appState.totalTimeFormatted)
                    .font(.system(.body, design: .monospaced, weight: .medium))

                if let start = appState.startTime {
                    Text("·")
                        .foregroundStyle(.secondary.opacity(0.5))
                    Text("desde \(appState.formatClock(start))")
                        .font(.caption)
                        .foregroundStyle(.secondary.opacity(0.5))
                }
            }
            .foregroundStyle(.secondary)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(.white.opacity(0.05), in: Capsule())

            if !appState.progressMessage.isEmpty {
                Text(appState.progressMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary.opacity(0.6))
                    .lineLimit(2)
            }
        }
        .padding(40)
    }
}

struct PhaseStep: View {
    let phase: ProcessingPhase
    let currentPhase: ProcessingPhase

    private var state: StepState {
        if phase.rawValue < currentPhase.rawValue { return .done }
        if phase.rawValue == currentPhase.rawValue { return .active }
        return .pending
    }

    private enum StepState {
        case done, active, pending
    }

    var body: some View {
        VStack(spacing: 6) {
            Circle()
                .fill(dotColor)
                .frame(width: 8, height: 8)

            Text(phase.label)
                .font(.system(size: 10))
                .foregroundStyle(textColor)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
    }

    private var dotColor: Color {
        switch state {
        case .done: .green
        case .active: .purple
        case .pending: .white.opacity(0.2)
        }
    }

    private var textColor: Color {
        switch state {
        case .done: .green.opacity(0.8)
        case .active: .white
        case .pending: .white.opacity(0.3)
        }
    }
}
