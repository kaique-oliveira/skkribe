using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Skribe.Models;
using Windows.ApplicationModel.DataTransfer;
using Windows.Storage.Pickers;
using Windows.UI;
using WinRT.Interop;

namespace Skribe.Views;

public sealed partial class ResultView : UserControl
{
    private readonly AppState _state;

    private static readonly Color[] SpeakerColors =
    {
        Color.FromArgb(255, 167, 139, 250), // purple
        Color.FromArgb(255, 248, 113, 113), // red
        Color.FromArgb(255, 52, 211, 153),  // green
        Color.FromArgb(255, 251, 146, 60),  // orange
        Color.FromArgb(255, 34, 211, 238),  // cyan
        Color.FromArgb(255, 244, 114, 182), // pink
    };

    public ResultView(AppState state)
    {
        InitializeComponent();
        _state = state;
        Render();
    }

    private void Render()
    {
        FileNameText.Text = _state.FileName;
        var ppl = _state.SpeakerCount == 1 ? "pessoa" : "pessoas";
        MetaText.Text = $"{_state.WordCount} palavras  ·  {_state.SpeakerCount} {ppl}";

        AudioDurationText.Text = _state.AudioDurationFormatted;
        ProcessedText.Text = _state.TotalTimeFormatted;
        StartText.Text = _state.StartTime is DateTime st ? _state.FormatClock(st) : "-";

        BuildTranscript();
    }

    private List<string> OrderedSpeakers()
    {
        var seen = new List<string>();
        foreach (var s in _state.Segments) if (!seen.Contains(s.Speaker)) seen.Add(s.Speaker);
        return seen;
    }

    private string DisplayName(string speaker) =>
        _state.SpeakerNames.TryGetValue(speaker, out var n) && !string.IsNullOrWhiteSpace(n) ? n : speaker;

    private (Color fg, Color bg) ColorFor(string speaker)
    {
        var idx = OrderedSpeakers().IndexOf(speaker);
        if (idx < 0) idx = 0;
        var c = SpeakerColors[idx % SpeakerColors.Length];
        return (c, Color.FromArgb(20, c.R, c.G, c.B));
    }

    private void BuildTranscript()
    {
        TranscriptHost.Children.Clear();
        string? prevSpeaker = null;
        int blockIndex = 0;
        foreach (var seg in _state.Segments)
        {
            var (fg, bg) = ColorFor(seg.Speaker);
            bool showHeader = seg.Speaker != prevSpeaker;

            var row = new StackPanel
            {
                Padding = new Thickness(24, 6, 24, 6),
                Background = new SolidColorBrush(bg)
            };

            if (showHeader)
            {
                var header = new StackPanel
                {
                    Orientation = Orientation.Horizontal,
                    Spacing = 8,
                    Margin = new Thickness(0, blockIndex > 0 ? 12 : 0, 0, 4)
                };

                var nameCap = new Border
                {
                    Background = new SolidColorBrush(bg),
                    CornerRadius = new CornerRadius(10),
                    Padding = new Thickness(8, 3, 8, 3),
                    Child = new TextBlock
                    {
                        Text = DisplayName(seg.Speaker),
                        FontSize = 11,
                        FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
                        Foreground = new SolidColorBrush(fg)
                    }
                };
                header.Children.Add(nameCap);

                header.Children.Add(new TextBlock
                {
                    Text = seg.FormattedStart,
                    FontSize = 10,
                    FontFamily = new FontFamily("Cascadia Mono,Consolas"),
                    Foreground = new SolidColorBrush(Color.FromArgb(120, 255, 255, 255)),
                    VerticalAlignment = VerticalAlignment.Center
                });

                var copyBtn = new Button
                {
                    Background = new SolidColorBrush(bg),
                    BorderThickness = new Thickness(0),
                    CornerRadius = new CornerRadius(10),
                    Padding = new Thickness(6, 2, 6, 2),
                    Tag = seg.Speaker
                };
                ToolTipService.SetToolTip(copyBtn, $"Copiar apenas a fala de {DisplayName(seg.Speaker)}");

                var btnContent = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 4 };
                var copyIcon = new FontIcon { Glyph = "", FontSize = 10, Foreground = new SolidColorBrush(fg) };
                var copyLabel = new TextBlock { Text = "Copiar fala", FontSize = 10, Foreground = new SolidColorBrush(fg) };
                btnContent.Children.Add(copyIcon);
                btnContent.Children.Add(copyLabel);
                copyBtn.Content = btnContent;
                copyBtn.Click += (_, _) => CopySpeaker(seg.Speaker, copyIcon, copyLabel);
                header.Children.Add(copyBtn);

                row.Children.Add(header);
            }

            var txt = new TextBlock
            {
                Text = seg.Text,
                FontSize = 14,
                Foreground = new SolidColorBrush(Color.FromArgb(230, 255, 255, 255)),
                TextWrapping = TextWrapping.Wrap,
                IsTextSelectionEnabled = true
            };
            row.Children.Add(txt);

            TranscriptHost.Children.Add(row);
            prevSpeaker = seg.Speaker;
            blockIndex++;
        }
    }

    private void CopySpeaker(string speaker, FontIcon icon, TextBlock label)
    {
        var lines = new List<string>
        {
            $"# {DisplayName(speaker)}",
            string.Empty
        };
        foreach (var s in _state.Segments.Where(s => s.Speaker == speaker))
            lines.Add($"[{s.FormattedStart}] {s.Text}");

        var pkg = new DataPackage();
        pkg.SetText(string.Join('\n', lines));
        Clipboard.SetContent(pkg);

        var originalGlyph = icon.Glyph;
        var originalText = label.Text;
        icon.Glyph = ""; // checkmark
        label.Text = "Copiado";
        DispatcherQueue.TryEnqueue(Microsoft.UI.Dispatching.DispatcherQueuePriority.Low, async () =>
        {
            await System.Threading.Tasks.Task.Delay(1800);
            icon.Glyph = originalGlyph;
            label.Text = originalText;
        });
    }

    private void CopyAll_Click(object sender, RoutedEventArgs e)
    {
        var sb = new StringBuilder();
        foreach (var s in _state.Segments)
            sb.AppendLine($"[{s.FormattedStart}] {DisplayName(s.Speaker)}: {s.Text}").AppendLine();
        var pkg = new DataPackage();
        pkg.SetText(sb.ToString());
        Clipboard.SetContent(pkg);

        CopyAllIcon.Glyph = "";
        CopyAllLabel.Text = "Copiado!";
        DispatcherQueue.TryEnqueue(async () =>
        {
            await System.Threading.Tasks.Task.Delay(1800);
            CopyAllIcon.Glyph = "";
            CopyAllLabel.Text = "Copiar texto";
        });
    }

    private async void SaveMd_Click(object sender, RoutedEventArgs e)
    {
        var picker = new FileSavePicker();
        var hwnd = WindowNative.GetWindowHandle(App.MainWindow);
        InitializeWithWindow.Initialize(picker, hwnd);
        picker.SuggestedFileName = Path.GetFileNameWithoutExtension(_state.FileName);
        picker.FileTypeChoices.Add("Markdown", new List<string> { ".md" });
        var file = await picker.PickSaveFileAsync();
        if (file == null) return;

        var lines = new List<string>();
        lines.Add($"# {_state.FileName}");
        lines.Add(string.Empty);
        if (_state.StartTime is DateTime st && _state.EndTime is DateTime ed)
        {
            lines.Add($"> **Início:** {_state.FormatClock(st)}  ·  **Fim:** {_state.FormatClock(ed)}  ·  **Processou em:** {_state.TotalTimeFormatted}");
            lines.Add(">");
            lines.Add($"> **Áudio:** {_state.AudioDurationFormatted}  ·  **Participantes:** {string.Join(", ", OrderedSpeakers().Select(DisplayName))}");
            lines.Add(">");
            lines.Add($"> **Palavras:** {_state.WordCount}  ·  **Pessoas:** {_state.SpeakerCount}");
            lines.Add(string.Empty);
        }
        lines.Add("---");
        lines.Add(string.Empty);

        string? lastSpeaker = null;
        foreach (var s in _state.Segments)
        {
            if (s.Speaker != lastSpeaker)
            {
                if (lastSpeaker != null) lines.Add(string.Empty);
                lines.Add($"### {DisplayName(s.Speaker)}");
                lastSpeaker = s.Speaker;
            }
            lines.Add($"`{s.FormattedStart}` {s.Text}");
        }
        await File.WriteAllTextAsync(file.Path, string.Join('\n', lines), Encoding.UTF8);

        SaveMdIcon.Glyph = "";
        SaveMdLabel.Text = "Salvo!";
        DispatcherQueue.TryEnqueue(async () =>
        {
            await System.Threading.Tasks.Task.Delay(1800);
            SaveMdIcon.Glyph = "";
            SaveMdLabel.Text = "Salvar .md";
        });
    }

    private async void Rename_Click(object sender, RoutedEventArgs e)
    {
        var dlg = new SpeakerNamingView(_state) { XamlRoot = this.XamlRoot };
        await dlg.ShowAsync();
        Render();
    }

    private void New_Click(object sender, RoutedEventArgs e) => _state.Reset();
}
