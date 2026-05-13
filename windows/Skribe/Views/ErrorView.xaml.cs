using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Skribe.Models;

namespace Skribe.Views;

public sealed partial class ErrorView : UserControl
{
    private readonly AppState _state;
    public ErrorView(AppState state)
    {
        InitializeComponent();
        _state = state;
        MessageText.Text = state.Status.Message ?? "Erro desconhecido.";
    }
    private void Retry_Click(object sender, RoutedEventArgs e) => _state.Reset();
}
