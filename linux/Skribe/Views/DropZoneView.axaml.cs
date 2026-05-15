using System;
using System.Collections.Generic;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Markup.Xaml;
using Avalonia.Platform.Storage;
using Skribe.Models;

namespace Skribe.Views;

public partial class DropZoneView : UserControl
{
    private readonly AppState _state;
    private readonly Action<string> _onFile;

    public DropZoneView() { AvaloniaXamlLoader.Load(this); _state = null!; _onFile = _ => { }; }

    public DropZoneView(AppState state, Action<string> onFile)
    {
        AvaloniaXamlLoader.Load(this);
        _state = state;
        _onFile = onFile;
    }

    private async void ChooseFile_Click(object? sender, RoutedEventArgs e)
    {
        var topLevel = TopLevel.GetTopLevel(this);
        if (topLevel == null) return;

        var files = await topLevel.StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions
        {
            Title = "Selecionar áudio ou vídeo",
            AllowMultiple = false,
            FileTypeFilter = new List<FilePickerFileType>
            {
                new("Áudio")
                {
                    Patterns = new[] { "*.mp3", "*.m4a", "*.wav", "*.ogg", "*.flac", "*.aac", "*.wma", "*.opus" }
                },
                new("Vídeo")
                {
                    Patterns = new[] { "*.mp4", "*.mov", "*.m4v", "*.mkv", "*.webm", "*.avi" }
                }
            }
        });

        if (files.Count > 0)
        {
            var path = files[0].Path.LocalPath;
            _onFile(path);
        }
    }
}
