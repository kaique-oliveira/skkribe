using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Skribe.Models;
using Skribe.Services;
using Skribe.Views;
using Windows.ApplicationModel.DataTransfer;

namespace Skribe;

public sealed partial class MainWindow : Window
{
    public AppState State { get; } = new();
    public ModelManager Models { get; } = new();
    public TranscriptionPipeline Pipeline { get; }

    private AppStatus _previousStatus = AppStatus.Idle;
    private static readonly string[] SupportedExt =
    {
        // audio
        ".mp3", ".m4a", ".wav", ".ogg", ".flac", ".aac", ".wma", ".opus",
        // video (audio track is extracted automatically)
        ".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi"
    };

    public MainWindow()
    {
        InitializeComponent();
        AppWindow.Resize(new Windows.Graphics.SizeInt32(900, 650));
        Title = "Skribe";

        Pipeline = new TranscriptionPipeline(DispatcherQueue);
        State.PropertyChanged += OnStateChanged;
        Render();

        _ = Models.PrepareAsync(State.SelectedModel, State);
    }

    private void OnStateChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(AppState.Status))
            DispatcherQueue.TryEnqueue(Render);
    }

    private void Render()
    {
        SettingsIcon.Glyph = State.Status.Kind == AppStatusKind.Settings ? "" : "";
        SettingsButton.Visibility = (State.Status.Kind == AppStatusKind.Working ||
                                     State.Status.Kind == AppStatusKind.Loading)
            ? Visibility.Collapsed : Visibility.Visible;

        ContentHost.Content = State.Status.Kind switch
        {
            AppStatusKind.Loading   => new ModelLoadingView(State),
            AppStatusKind.Idle      => new DropZoneView(State, StartProcessing),
            AppStatusKind.Working   => new ProcessingView(State),
            AppStatusKind.Done      => new ResultView(State),
            AppStatusKind.Error     => new ErrorView(State),
            AppStatusKind.Settings  => new SettingsView(State),
            _                        => null!
        };
    }

    private void SettingsButton_Click(object sender, RoutedEventArgs e)
    {
        if (State.Status.Kind == AppStatusKind.Settings) State.Status = _previousStatus;
        else { _previousStatus = State.Status; State.Status = AppStatus.Settings; }
    }

    private void Root_DragOver(object sender, DragEventArgs e)
    {
        e.AcceptedOperation = DataPackageOperation.Copy;
        if (e.DragUIOverride != null)
        {
            e.DragUIOverride.Caption = "Solte o áudio aqui";
            e.DragUIOverride.IsCaptionVisible = true;
        }
    }

    private async void Root_Drop(object sender, DragEventArgs e)
    {
        if (!e.DataView.Contains(StandardDataFormats.StorageItems)) return;
        var items = await e.DataView.GetStorageItemsAsync();
        foreach (var item in items)
        {
            if (item is Windows.Storage.StorageFile file)
            {
                var ext = Path.GetExtension(file.Path).ToLowerInvariant();
                if (Array.IndexOf(SupportedExt, ext) >= 0)
                {
                    StartProcessing(file.Path);
                    return;
                }
            }
        }
    }

    public void StartProcessing(string path)
    {
        _ = Pipeline.ProcessAsync(path, State, Models);
    }
}
