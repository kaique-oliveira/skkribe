using System.ComponentModel;
using Microsoft.UI.Xaml.Controls;
using Skribe.Models;

namespace Skribe.Views;

public sealed partial class ModelLoadingView : UserControl
{
    private readonly AppState _state;

    public ModelLoadingView(AppState state)
    {
        InitializeComponent();
        _state = state;
        _state.PropertyChanged += OnChanged;
        Refresh();
    }

    private void OnChanged(object? sender, PropertyChangedEventArgs e)
    {
        DispatcherQueue.TryEnqueue(Refresh);
    }

    private void Refresh()
    {
        MessageText.Text = _state.Status.Message ?? "Carregando...";
        ProgressBar.Value = _state.LoadingProgress;
        PercentText.Text = $"{(int)(_state.LoadingProgress * 100)}%";
    }
}
