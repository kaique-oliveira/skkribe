using System.Collections.Generic;
using System.Linq;
using Microsoft.UI.Xaml.Controls;
using Skribe.Models;

namespace Skribe.Views;

public sealed partial class SpeakerNamingView : ContentDialog
{
    private readonly AppState _state;
    private readonly Dictionary<string, TextBox> _inputs = new();

    public SpeakerNamingView(AppState state)
    {
        InitializeComponent();
        _state = state;
        Build();
        PrimaryButtonClick += OnSave;
    }

    private void Build()
    {
        SpeakersList.Children.Clear();
        var seen = new List<string>();
        foreach (var s in _state.Segments) if (!seen.Contains(s.Speaker)) seen.Add(s.Speaker);

        foreach (var speaker in seen)
        {
            var card = new Border
            {
                Background = (Microsoft.UI.Xaml.Media.Brush)Microsoft.UI.Xaml.Application.Current.Resources["CardBrush"],
                CornerRadius = new Microsoft.UI.Xaml.CornerRadius(8),
                Padding = new Microsoft.UI.Xaml.Thickness(12)
            };
            var stack = new StackPanel { Spacing = 6 };
            stack.Children.Add(new TextBlock
            {
                Text = speaker,
                FontSize = 11,
                FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
                Foreground = (Microsoft.UI.Xaml.Media.Brush)Microsoft.UI.Xaml.Application.Current.Resources["TextSecondaryBrush"]
            });
            var box = new TextBox
            {
                PlaceholderText = "Nome (ex: João, Maria)",
                Text = _state.SpeakerNames.TryGetValue(speaker, out var n) ? n : string.Empty
            };
            _inputs[speaker] = box;
            stack.Children.Add(box);
            card.Child = stack;
            SpeakersList.Children.Add(card);
        }
    }

    private void OnSave(ContentDialog sender, ContentDialogButtonClickEventArgs args)
    {
        foreach (var kv in _inputs)
        {
            var trimmed = kv.Value.Text.Trim();
            if (string.IsNullOrEmpty(trimmed)) _state.SpeakerNames.Remove(kv.Key);
            else _state.SpeakerNames[kv.Key] = trimmed;
        }
    }
}
