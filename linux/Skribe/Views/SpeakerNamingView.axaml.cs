using System.Collections.Generic;
using System.Linq;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Markup.Xaml;
using Avalonia.Media;
using Skribe.Models;

namespace Skribe.Views;

public partial class SpeakerNamingView : Window
{
    private readonly AppState _state = null!;
    private readonly Dictionary<string, TextBox> _inputs = new();

    public SpeakerNamingView() { AvaloniaXamlLoader.Load(this); }

    public SpeakerNamingView(AppState state)
    {
        AvaloniaXamlLoader.Load(this);
        _state = state;
        Build();
    }

    private List<string> OrderedSpeakers()
    {
        var seen = new List<string>();
        foreach (var s in _state.Segments)
            if (!seen.Contains(s.Speaker)) seen.Add(s.Speaker);
        return seen;
    }

    private void Build()
    {
        var panel = this.FindControl<StackPanel>("SpeakersPanel");
        if (panel == null) return;
        panel.Children.Clear();
        _inputs.Clear();

        foreach (var speaker in OrderedSpeakers())
        {
            var row = new StackPanel { Spacing = 4 };
            row.Children.Add(new TextBlock
            {
                Text = speaker,
                FontSize = 11,
                Foreground = (IBrush)Application.Current!.Resources["TextTertiaryBrush"]!
            });

            var input = new TextBox
            {
                Text = _state.SpeakerNames.TryGetValue(speaker, out var v) ? v : speaker,
                FontSize = 13,
                Watermark = speaker
            };
            row.Children.Add(input);
            _inputs[speaker] = input;
            panel.Children.Add(row);
        }
    }

    private void Save_Click(object? sender, RoutedEventArgs e)
    {
        foreach (var (speaker, input) in _inputs)
        {
            var name = input.Text?.Trim() ?? string.Empty;
            if (string.IsNullOrEmpty(name)) _state.SpeakerNames.Remove(speaker);
            else _state.SpeakerNames[speaker] = name;
        }
        Close();
    }

    private void Cancel_Click(object? sender, RoutedEventArgs e) => Close();
}
