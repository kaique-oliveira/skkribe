using System.ComponentModel;
using Avalonia.Controls;
using Avalonia.Markup.Xaml;
using Avalonia.Threading;
using Skribe.Models;

namespace Skribe.Views;

public partial class ModelLoadingView : UserControl
{
    private readonly AppState _state = null!;

    public ModelLoadingView() { AvaloniaXamlLoader.Load(this); }

    public ModelLoadingView(AppState state)
    {
        AvaloniaXamlLoader.Load(this);
        _state = state;
        _state.PropertyChanged += OnStateChanged;
        Update();
    }

    private void OnStateChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(AppState.Status) || e.PropertyName == nameof(AppState.LoadingProgress))
            Dispatcher.UIThread.Post(Update);
    }

    private void Update()
    {
        var bar = this.FindControl<ProgressBar>("LoadingBar");
        var msg = this.FindControl<TextBlock>("LoadingMessage");
        if (bar != null) bar.Value = _state.LoadingProgress;
        if (msg != null) msg.Text = _state.Status.Message ?? "Carregando...";
    }
}
