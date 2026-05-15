using System;
using System.Diagnostics;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Layout;
using Avalonia.Markup.Xaml;
using Avalonia.Media;
using Skribe.Models;

namespace Skribe.Views;

public partial class SettingsView : UserControl
{
    private readonly AppState _state = null!;

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

    public SettingsView() { AvaloniaXamlLoader.Load(this); }

    public SettingsView(AppState state)
    {
        AvaloniaXamlLoader.Load(this);
        _state = state;
        Build();
    }

    private void Build()
    {
        var panel = this.FindControl<StackPanel>("ModelsPanel");
        if (panel == null) return;
        panel.Children.Clear();

        foreach (var m in _models)
        {
            var isSelected = m.Id == _state.SelectedModel;
            var card = new Button
            {
                HorizontalAlignment = HorizontalAlignment.Stretch,
                HorizontalContentAlignment = HorizontalAlignment.Stretch,
                Padding = new Avalonia.Thickness(12),
                CornerRadius = new Avalonia.CornerRadius(8),
                BorderThickness = new Avalonia.Thickness(1),
                Background = isSelected
                    ? new SolidColorBrush(Color.FromArgb(40, 167, 139, 250))
                    : new SolidColorBrush(Color.FromArgb(10, 255, 255, 255)),
                BorderBrush = isSelected
                    ? new SolidColorBrush(Color.FromArgb(80, 167, 139, 250))
                    : new SolidColorBrush(Colors.Transparent),
                Tag = m.Id
            };

            var grid = new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("*,Auto")
            };

            var stack = new StackPanel { Spacing = 2 };
            stack.Children.Add(new TextBlock
            {
                Text = m.Label,
                FontSize = 13,
                FontWeight = FontWeight.SemiBold,
                Foreground = (IBrush)Application.Current!.Resources["TextPrimaryBrush"]!
            });
            stack.Children.Add(new TextBlock
            {
                Text = m.Desc,
                FontSize = 11,
                Foreground = (IBrush)Application.Current.Resources["TextSecondaryBrush"]!,
                TextWrapping = TextWrapping.Wrap
            });
            Grid.SetColumn(stack, 0);
            grid.Children.Add(stack);

            if (isSelected)
            {
                var check = new TextBlock
                {
                    Text = "✓",
                    FontSize = 16,
                    FontWeight = FontWeight.Bold,
                    Foreground = (IBrush)Application.Current.Resources["PurpleBrush"]!,
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
            panel.Children.Add(card);
        }
    }

    private async Task ConfirmModelChange(string newModelId)
    {
        var dialog = new Window
        {
            Title = "Reiniciar para aplicar?",
            Width = 480,
            Height = 200,
            CanResize = false,
            WindowStartupLocation = WindowStartupLocation.CenterOwner,
            Background = (IBrush)Application.Current!.Resources["BgBrush"]!
        };

        var stack = new StackPanel { Spacing = 18, Margin = new Avalonia.Thickness(24) };
        stack.Children.Add(new TextBlock
        {
            Text = "Reiniciar para aplicar?",
            FontSize = 16,
            FontWeight = FontWeight.SemiBold,
            Foreground = (IBrush)Application.Current.Resources["TextPrimaryBrush"]!
        });
        stack.Children.Add(new TextBlock
        {
            Text = "Para trocar o modelo de transcrição é necessário fechar e abrir o Skribe novamente. " +
                   "Qualquer transcrição em andamento será perdida.",
            FontSize = 12,
            TextWrapping = TextWrapping.Wrap,
            Foreground = (IBrush)Application.Current.Resources["TextSecondaryBrush"]!
        });

        var btns = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            HorizontalAlignment = HorizontalAlignment.Right
        };

        var confirmed = false;
        var cancelBtn = new Button { Content = "Cancelar", Classes = { "secondary" } };
        var restartBtn = new Button { Content = "Reiniciar", Classes = { "secondary" } };
        cancelBtn.Click += (_, _) => dialog.Close();
        restartBtn.Click += (_, _) => { confirmed = true; dialog.Close(); };
        btns.Children.Add(cancelBtn);
        btns.Children.Add(restartBtn);
        stack.Children.Add(btns);

        dialog.Content = stack;
        var owner = App.MainWindow;
        if (owner != null) await dialog.ShowDialog(owner);
        else dialog.Show();

        if (confirmed)
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
        if (Application.Current?.ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            desktop.Shutdown();
        }
    }
}
