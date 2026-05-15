using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Markup.Xaml;
using Skribe.Models;

namespace Skribe.Views;

public partial class ErrorView : UserControl
{
    private readonly AppState _state = null!;

    public ErrorView() { AvaloniaXamlLoader.Load(this); }

    public ErrorView(AppState state)
    {
        AvaloniaXamlLoader.Load(this);
        _state = state;
        var msg = this.FindControl<TextBlock>("ErrorMessage");
        if (msg != null) msg.Text = state.Status.Message ?? "Erro desconhecido";
    }

    private void Reset_Click(object? sender, RoutedEventArgs e) => _state.Reset();
}
