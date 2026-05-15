using System.ComponentModel;
using Avalonia.Controls;
using Avalonia.Markup.Xaml;
using Avalonia.Threading;
using Skribe.Models;

namespace Skribe.Views;

public partial class ProcessingView : UserControl
{
    private readonly AppState _state = null!;

    public ProcessingView() { AvaloniaXamlLoader.Load(this); }

    public ProcessingView(AppState state)
    {
        AvaloniaXamlLoader.Load(this);
        _state = state;
        _state.PropertyChanged += OnStateChanged;
        Update();
    }

    private void OnStateChanged(object? sender, PropertyChangedEventArgs e) =>
        Dispatcher.UIThread.Post(Update);

    private void Update()
    {
        var phase = _state.CurrentPhase;
        var label = this.FindControl<TextBlock>("PhaseLabel");
        var detail = this.FindControl<TextBlock>("PhaseDetail");
        var icon = this.FindControl<TextBlock>("PhaseIcon");
        var progress = this.FindControl<TextBlock>("ProgressMessage");
        var elapsed = this.FindControl<TextBlock>("ElapsedText");

        if (label != null) label.Text = phase.Label();
        if (detail != null) detail.Text = phase.Detail();
        if (icon != null) icon.Text = phase switch
        {
            ProcessingPhase.Preparing => "🎧",
            ProcessingPhase.Transcribing => "✏",
            ProcessingPhase.Diarizing => "👥",
            ProcessingPhase.Merging => "🧩",
            _ => "🎧"
        };
        if (progress != null) progress.Text = _state.ProgressMessage;
        if (elapsed != null) elapsed.Text = $"⏱ {_state.TotalTimeFormatted}";
    }
}
