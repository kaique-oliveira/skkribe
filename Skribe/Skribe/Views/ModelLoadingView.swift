import SwiftUI

struct ModelLoadingView: View {
    let message: String
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(spacing: 28) {
            VStack(spacing: 8) {
                Text("Preparando o Skribe")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.white)

                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 340)
            }

            VStack(spacing: 8) {
                ProgressView(value: appState.loadingProgress)
                    .tint(.purple)
                    .frame(width: 280)

                Text("\(Int(appState.loadingProgress * 100))%")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            Text("Só na primeira vez. Depois fica salvo no Mac.")
                .font(.caption)
                .foregroundStyle(.secondary.opacity(0.5))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
