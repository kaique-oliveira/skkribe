using System;
using System.Diagnostics;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Skribe.Models;
using Windows.UI;

namespace Skribe.Views;

public sealed partial class SettingsView : UserControl
{
    private readonly AppState _state;

    private readonly (string Id, string Label, string Desc)[] _models =
    {
        ("ggml-small",
            "Small",
            "466 MB · ~3 min para 1h de áudio · bom para rascunhos rápidos, erra em sotaques e nomes próprios"),
        ("ggml-medium",
            "Medium · Recomendado",
            "1.5 GB · ~7 min para 1h · ótimo equilíbrio, raras alucinações, padrão do app"),
        ("ggml-large-v3-turbo",
            "Large v3 Turbo",
            "1.6 GB · ~12 min para 1h · destilado do Large v3, qualidade quase igual ao topo com metade do tempo"),
        ("ggml-large-v3",
            "Large v3 · Máxima qualidade",
            "3.0 GB · ~25 min para 1h · menos alucinações em silêncio, melhor em áudio longo e sotaque pesado. Usa ~4 GB de RAM"),
    };

    public SettingsView(AppState state)
    {
        InitializeComponent();
        _state = state;
        Build();
    }

    private void Build()
    {
        ModelsPanel.Children.Clear();
        foreach (var m in _models)
        {
            var card = new Button
            {
                HorizontalAlignment = HorizontalAlignment.Stretch,
                HorizontalContentAlignment = HorizontalAlignment.Stretch,
                Padding = new Thickness(12),
                CornerRadius = new CornerRadius(8),
                BorderThickness = new Thickness(1),
                Tag = m.Id
            };
            ApplyCardLook(card, m.Id == _state.SelectedModel);

            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var stack = new StackPanel { Spacing = 2 };
            stack.Children.Add(new TextBlock
            {
                Text = m.Label,
                FontSize = 13,
                FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
                Foreground = (Brush)Application.Current.Resources["TextPrimaryBrush"]
            });
            stack.Children.Add(new TextBlock
            {
                Text = m.Desc,
                FontSize = 11,
                Foreground = (Brush)Application.Current.Resources["TextSecondaryBrush"],
                TextWrapping = TextWrapping.Wrap
            });
            Grid.SetColumn(stack, 0);
            grid.Children.Add(stack);

            if (m.Id == _state.SelectedModel)
            {
                var check = new FontIcon
                {
                    Glyph = "", // checkmark
                    FontSize = 16,
                    Foreground = (Brush)Application.Current.Resources["PurpleBrush"],
                    VerticalAlignment = VerticalAlignment.Center
                };
                Grid.SetColumn(check, 1);
                grid.Children.Add(check);
            }

            card.Content = grid;
            var capturedId = m.Id;
            card.Click += async (_, _) =>
            {
                if (capturedId == _state.SelectedModel) return;
                await ConfirmModelChange(capturedId);
            };
            ModelsPanel.Children.Add(card);
        }
    }

    private async System.Threading.Tasks.Task ConfirmModelChange(string newModelId)
    {
        var dlg = new ContentDialog
        {
            Title = "Reiniciar para aplicar?",
            Content = "Para trocar o modelo de transcrição é necessário fechar e abrir o Skribe novamente. " +
                      "Qualquer transcrição em andamento será perdida.",
            PrimaryButtonText = "Reiniciar",
            CloseButtonText = "Cancelar",
            DefaultButton = ContentDialogButton.Primary,
            XamlRoot = this.XamlRoot
        };

        var result = await dlg.ShowAsync();
        if (result == ContentDialogResult.Primary)
        {
            _state.SelectedModel = newModelId;
            RestartApp();
        }
    }

    private static void RestartApp()
    {
        var path = Environment.ProcessPath;
        if (!string.IsNullOrEmpty(path))
        {
            try { Process.Start(path); } catch { /* ignore */ }
        }
        Application.Current.Exit();
    }

    private static void ApplyCardLook(Button btn, bool selected)
    {
        btn.Background = new SolidColorBrush(selected
            ? Color.FromArgb(40, 167, 139, 250)
            : Color.FromArgb(10, 255, 255, 255));
        btn.BorderBrush = new SolidColorBrush(selected
            ? Color.FromArgb(80, 167, 139, 250)
            : Color.FromArgb(0, 0, 0, 0));
    }
}
