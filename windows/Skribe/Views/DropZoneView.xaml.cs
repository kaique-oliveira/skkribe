using System;
using Microsoft.UI.Xaml.Controls;
using Skribe.Models;
using Windows.Storage.Pickers;
using WinRT.Interop;

namespace Skribe.Views;

public sealed partial class DropZoneView : UserControl
{
    private readonly AppState _state;
    private readonly Action<string> _onFile;

    public DropZoneView(AppState state, Action<string> onFile)
    {
        InitializeComponent();
        _state = state;
        _onFile = onFile;
    }

    private async void ChooseFile_Click(object sender, Microsoft.UI.Xaml.RoutedEventArgs e)
    {
        var picker = new FileOpenPicker();
        var hwnd = WindowNative.GetWindowHandle(App.MainWindow);
        InitializeWithWindow.Initialize(picker, hwnd);
        // audio
        picker.FileTypeFilter.Add(".mp3");
        picker.FileTypeFilter.Add(".m4a");
        picker.FileTypeFilter.Add(".wav");
        picker.FileTypeFilter.Add(".ogg");
        picker.FileTypeFilter.Add(".flac");
        picker.FileTypeFilter.Add(".aac");
        picker.FileTypeFilter.Add(".wma");
        picker.FileTypeFilter.Add(".opus");
        // video
        picker.FileTypeFilter.Add(".mp4");
        picker.FileTypeFilter.Add(".mov");
        picker.FileTypeFilter.Add(".m4v");
        picker.FileTypeFilter.Add(".mkv");
        picker.FileTypeFilter.Add(".webm");
        picker.FileTypeFilter.Add(".avi");
        var file = await picker.PickSingleFileAsync();
        if (file != null) _onFile(file.Path);
    }
}
