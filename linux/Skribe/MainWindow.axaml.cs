using System;
using System.ComponentModel;
using System.IO;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Markup.Xaml;
using Avalonia.Threading;
using Skribe.Models;
using Skribe.Services;
using Skribe.Views;

namespace Skribe;

public partial class MainWindow : Window
{
    public AppState State { get; } = new();
    public ModelManager Models { get; } = new();
    public TranscriptionPipeline Pipeline { get; } = new();

    private AppStatus _previousStatus = AppStatus.Idle;

    private static readonly string[] SupportedExt =
    {
        ".mp3", ".m4a", ".wav", ".ogg", ".flac", ".aac", ".wma", ".opus",
        ".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi"
    };

    public MainWindow()
    {
        AvaloniaXamlLoader.Load(this);

        State.PropertyChanged += OnStateChanged;
        AddHandler(DragDrop.DragOverEvent, OnDragOver);
        AddHandler(DragDrop.DropEvent, OnDrop);

        Render();
        _ = Models.PrepareAsync(State.SelectedModel, State);
    }

    private void OnStateChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(AppState.Status))
            Dispatcher.UIThread.Post(Render);
    }

    private void Render()
    {
        var settingsIcon = this.FindControl<TextBlock>("SettingsIcon");
        if (settingsIcon != null)
            settingsIcon.Text = State.Status.Kind == AppStatusKind.Settings ? "✕" : "⚙";

        var settingsBtn = this.FindControl<Button>("SettingsButton");
        if (settingsBtn != null)
            settingsBtn.IsVisible = State.Status.Kind != AppStatusKind.Working
                                  && State.Status.Kind != AppStatusKind.Loading;

        var host = this.FindControl<ContentControl>("ContentHost");
        if (host == null) return;

        host.Content = State.Status.Kind switch
        {
            AppStatusKind.Loading  => new ModelLoadingView(State),
            AppStatusKind.Idle     => new DropZoneView(State, StartProcessing),
            AppStatusKind.Working  => new ProcessingView(State),
            AppStatusKind.Done     => new ResultView(State),
            AppStatusKind.Error    => new ErrorView(State),
            AppStatusKind.Settings => new SettingsView(State),
            _                       => null
        };
    }

    private void SettingsButton_Click(object? sender, RoutedEventArgs e)
    {
        if (State.Status.Kind == AppStatusKind.Settings)
            State.Status = _previousStatus;
        else
        {
            _previousStatus = State.Status;
            State.Status = AppStatus.Settings;
        }
    }

    private static void OnDragOver(object? _, DragEventArgs e)
    {
        e.DragEffects = e.Data.Contains(DataFormats.Files) ? DragDropEffects.Copy : DragDropEffects.None;
    }

    private void OnDrop(object? _, DragEventArgs e)
    {
        if (!e.Data.Contains(DataFormats.Files)) return;
        var files = e.Data.GetFiles();
        if (files == null) return;
        foreach (var file in files)
        {
            var path = file.Path.LocalPath;
            var ext = Path.GetExtension(path).ToLowerInvariant();
            if (Array.IndexOf(SupportedExt, ext) >= 0)
            {
                StartProcessing(path);
                return;
            }
        }
    }

    public void StartProcessing(string path) => _ = Pipeline.ProcessAsync(path, State, Models);
}
