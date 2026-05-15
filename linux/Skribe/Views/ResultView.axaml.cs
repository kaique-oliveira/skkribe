using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Markup.Xaml;
using Avalonia.Media;
using Avalonia.Platform.Storage;
using Avalonia.Threading;
using Skribe.Models;

namespace Skribe.Views;

public partial class ResultView : UserControl
{
    private readonly AppState _state = null!;

    private static readonly Color[] SpeakerColors =
    {
        Color.FromArgb(255, 167, 139, 250),
        Color.FromArgb(255, 248, 113, 113),
        Color.FromArgb(255, 52, 211, 153),
        Color.FromArgb(255, 251, 146, 60),
        Color.FromArgb(255, 34, 211, 238),
        Color.FromArgb(255, 244, 114, 182),
    };

    public ResultView() { AvaloniaXamlLoader.Load(this); }

    public ResultView(AppState state)
    {
        AvaloniaXamlLoader.Load(this);
        _state = state;
        Render();
    }

    private void Render()
    {
        var fileName = this.FindControl<TextBlock>("FileNameText");
        var meta = this.FindControl<TextBlock>("MetaText");
        var audio = this.FindControl<TextBlock>("AudioDurationText");
        var processed = this.FindControl<TextBlock>("ProcessedText");
        var start = this.FindControl<TextBlock>("StartText");

        if (fileName != null) fileName.Text = _state.FileName;
        if (meta != null)
        {
            var ppl = _state.SpeakerCount == 1 ? "pessoa" : "pessoas";
            meta.Text = $"{_state.WordCount} palavras  ·  {_state.SpeakerCount} {ppl}";
        }
        if (audio != null) audio.Text = _state.AudioDurationFormatted;
        if (processed != null) processed.Text = _state.TotalTimeFormatted;
        if (start != null) start.Text = _state.StartTime is DateTime st ? _state.FormatClock(st) : "-";

        BuildTranscript();
    }

    private List<string> OrderedSpeakers()
    {
        var seen = new List<string>();
        foreach (var s in _state.Segments)
            if (!seen.Contains(s.Speaker)) seen.Add(s.Speaker);
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
        var host = this.FindControl<StackPanel>("TranscriptHost");
        if (host == null) return;
        host.Children.Clear();

        string? prevSpeaker = null;
        int blockIndex = 0;

        foreach (var seg in _state.Segments)
        {
            var (fg, bg) = ColorFor(seg.Speaker);
            bool showHeader = seg.Speaker != prevSpeaker;

            var row = new StackPanel
            {
                Margin = new Thickness(0),
                Background = new SolidColorBrush(bg)
            };

            var inner = new StackPanel { Margin = new Thickness(24, 6, 24, 6) };

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
                        FontWeight = FontWeight.SemiBold,
                        Foreground = new SolidColorBrush(fg)
                    }
                };
                header.Children.Add(nameCap);

                header.Children.Add(new TextBlock
                {
                    Text = seg.FormattedStart,
                    FontSize = 10,
                    FontFamily = new FontFamily("Cascadia Mono,Consolas,monospace"),
                    Foreground = new SolidColorBrush(Color.FromArgb(120, 255, 255, 255)),
                    VerticalAlignment = VerticalAlignment.Center
                });

                var copyBtn = new Button
                {
                    Background = new SolidColorBrush(bg),
                    BorderThickness = new Thickness(0),
                    CornerRadius = new CornerRadius(10),
                    Padding = new Thickness(8, 3, 8, 3),
                    Tag = seg.Speaker
                };
                var copyLabel = new TextBlock
                {
                    Text = "Copiar fala",
                    FontSize = 10,
                    Foreground = new SolidColorBrush(fg)
                };
                copyBtn.Content = copyLabel;
                copyBtn.Click += (_, _) => _ = CopySpeaker(seg.Speaker, copyLabel);
                ToolTip.SetTip(copyBtn, $"Copiar apenas a fala de {DisplayName(seg.Speaker)}");
                header.Children.Add(copyBtn);

                inner.Children.Add(header);
            }

            inner.Children.Add(new TextBlock
            {
                Text = seg.Text,
                FontSize = 14,
                Foreground = new SolidColorBrush(Color.FromArgb(230, 255, 255, 255)),
                TextWrapping = TextWrapping.Wrap
            });

            row.Children.Add(inner);
            host.Children.Add(row);
            prevSpeaker = seg.Speaker;
            blockIndex++;
        }
    }

    private async Task CopySpeaker(string speaker, TextBlock label)
    {
        var lines = new List<string> { $"# {DisplayName(speaker)}", string.Empty };
        foreach (var s in _state.Segments.Where(s => s.Speaker == speaker))
            lines.Add($"[{s.FormattedStart}] {s.Text}");

        var clipboard = TopLevel.GetTopLevel(this)?.Clipboard;
        if (clipboard != null)
            await clipboard.SetTextAsync(string.Join('\n', lines));

        var original = label.Text;
        label.Text = "Copiado";
        await Task.Delay(1800);
        label.Text = original;
    }

    private async void CopyAll_Click(object? sender, RoutedEventArgs e)
    {
        var sb = new StringBuilder();
        foreach (var s in _state.Segments)
            sb.AppendLine($"[{s.FormattedStart}] {DisplayName(s.Speaker)}: {s.Text}").AppendLine();

        var clipboard = TopLevel.GetTopLevel(this)?.Clipboard;
        if (clipboard != null)
            await clipboard.SetTextAsync(sb.ToString());

        var lbl = this.FindControl<TextBlock>("CopyAllLabel");
        if (lbl != null)
        {
            lbl.Text = "Copiado!";
            await Task.Delay(1800);
            lbl.Text = "Copiar texto";
        }
    }

    private async void SaveMd_Click(object? sender, RoutedEventArgs e)
    {
        var topLevel = TopLevel.GetTopLevel(this);
        if (topLevel == null) return;

        var file = await topLevel.StorageProvider.SaveFilePickerAsync(new FilePickerSaveOptions
        {
            Title = "Salvar transcrição",
            SuggestedFileName = Path.GetFileNameWithoutExtension(_state.FileName),
            DefaultExtension = "md",
            FileTypeChoices = new[] { new FilePickerFileType("Markdown") { Patterns = new[] { "*.md" } } }
        });
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

        await using var stream = await file.OpenWriteAsync();
        await using var writer = new StreamWriter(stream, Encoding.UTF8);
        await writer.WriteAsync(string.Join('\n', lines));

        var lbl = this.FindControl<TextBlock>("SaveMdLabel");
        if (lbl != null)
        {
            lbl.Text = "Salvo!";
            await Task.Delay(1800);
            lbl.Text = "Salvar .md";
        }
    }

    private async void Rename_Click(object? sender, RoutedEventArgs e)
    {
        var dialog = new SpeakerNamingView(_state);
        var owner = App.MainWindow;
        if (owner != null) await dialog.ShowDialog(owner);
        else dialog.Show();
        Render();
    }

    private void New_Click(object? sender, RoutedEventArgs e) => _state.Reset();
}
