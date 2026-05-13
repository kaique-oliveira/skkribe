using System;
using System.ComponentModel;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Shapes;
using Skribe.Models;
using Windows.UI;

namespace Skribe.Views;

public sealed partial class ProcessingView : UserControl
{
    private readonly AppState _state;

    public ProcessingView(AppState state)
    {
        InitializeComponent();
        _state = state;
        _state.PropertyChanged += OnChanged;
        BuildSteps();
        Refresh();
    }

    private void BuildSteps()
    {
        foreach (ProcessingPhase phase in Enum.GetValues(typeof(ProcessingPhase)))
        {
            var col = (int)phase;
            var panel = new StackPanel { Spacing = 6, HorizontalAlignment = HorizontalAlignment.Center };
            var dot = new Ellipse { Width = 8, Height = 8, Fill = new SolidColorBrush(Color.FromArgb(60, 255, 255, 255)) };
            var label = new TextBlock { FontSize = 10, TextAlignment = TextAlignment.Center };
            panel.Children.Add(dot);
            panel.Children.Add(label);
            Grid.SetColumn(panel, col);
            StepsGrid.Children.Add(panel);
        }
    }

    private void OnChanged(object? sender, PropertyChangedEventArgs e)
    {
        DispatcherQueue.TryEnqueue(Refresh);
    }

    private void Refresh()
    {
        PhaseIcon.Glyph = _state.CurrentPhase.Icon();
        PhaseLabel.Text = _state.CurrentPhase.Label();
        PhaseDetail.Text = _state.CurrentPhase.Detail();
        ProgressMessage.Text = _state.ProgressMessage;
        TimerText.Text = _state.TotalTimeFormatted;
        StartTimeText.Text = _state.StartTime is DateTime st ? $"desde {st:HH:mm:ss}" : string.Empty;

        for (int i = 0; i < StepsGrid.Children.Count; i++)
        {
            if (StepsGrid.Children[i] is not StackPanel sp) continue;
            var phase = (ProcessingPhase)i;
            var dot = (Ellipse)sp.Children[0];
            var label = (TextBlock)sp.Children[1];
            label.Text = phase.Label();
            if (phase < _state.CurrentPhase)
            {
                dot.Fill = new SolidColorBrush(Color.FromArgb(255, 52, 211, 153));
                label.Foreground = new SolidColorBrush(Color.FromArgb(200, 52, 211, 153));
            }
            else if (phase == _state.CurrentPhase)
            {
                dot.Fill = new SolidColorBrush(Color.FromArgb(255, 167, 139, 250));
                label.Foreground = new SolidColorBrush(Color.FromArgb(255, 255, 255, 255));
            }
            else
            {
                dot.Fill = new SolidColorBrush(Color.FromArgb(60, 255, 255, 255));
                label.Foreground = new SolidColorBrush(Color.FromArgb(80, 255, 255, 255));
            }
        }
    }
}
