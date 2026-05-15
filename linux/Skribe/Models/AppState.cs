using System;
using System.Collections.ObjectModel;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Timers;
using CommunityToolkit.Mvvm.ComponentModel;

namespace Skribe.Models;

public partial class AppState : ObservableObject
{
    private const string DefaultModel = "ggml-medium";

    [ObservableProperty] private AppStatus status = AppStatus.Idle;
    [ObservableProperty] private string fileName = string.Empty;
    [ObservableProperty] private ProcessingPhase currentPhase = ProcessingPhase.Preparing;
    [ObservableProperty] private string progressMessage = string.Empty;
    [ObservableProperty] private double transcriptionProgress;
    [ObservableProperty] private int elapsed;
    [ObservableProperty] private DateTime? startTime;
    [ObservableProperty] private DateTime? endTime;
    [ObservableProperty] private double audioDuration;
    [ObservableProperty] private double loadingProgress;

    private string _selectedModel = LoadStoredModel();
    public string SelectedModel
    {
        get => _selectedModel;
        set
        {
            if (SetProperty(ref _selectedModel, value))
                SaveStoredModel(value);
        }
    }

    public ObservableCollection<SkribeSegment> Segments { get; } = new();
    public Dictionary<string, string> SpeakerNames { get; } = new();

    private System.Timers.Timer? _timer;

    public string TotalTimeFormatted => FormatElapsed(Elapsed);
    public string AudioDurationFormatted => FormatElapsed((int)AudioDuration);
    public int WordCount => Segments.Sum(s => s.Text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length);
    public int SpeakerCount => Segments.Select(s => s.Speaker).Distinct().Count();

    private static string SettingsPath
    {
        get
        {
            var xdg = Environment.GetEnvironmentVariable("XDG_CONFIG_HOME");
            var baseDir = string.IsNullOrWhiteSpace(xdg)
                ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".config")
                : xdg;
            var dir = Path.Combine(baseDir, "Skribe");
            Directory.CreateDirectory(dir);
            return Path.Combine(dir, "settings.json");
        }
    }

    private sealed class Settings
    {
        public string? SelectedModel { get; set; }
    }

    private static string LoadStoredModel()
    {
        try
        {
            if (!File.Exists(SettingsPath)) return DefaultModel;
            var json = File.ReadAllText(SettingsPath);
            var s = JsonSerializer.Deserialize<Settings>(json);
            return string.IsNullOrWhiteSpace(s?.SelectedModel) ? DefaultModel : s.SelectedModel!;
        }
        catch { return DefaultModel; }
    }

    private static void SaveStoredModel(string model)
    {
        try
        {
            var json = JsonSerializer.Serialize(new Settings { SelectedModel = model },
                new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(SettingsPath, json);
        }
        catch { /* ignore */ }
    }

    public void StartProcessing()
    {
        Status = AppStatus.Working;
        Segments.Clear();
        ProgressMessage = string.Empty;
        TranscriptionProgress = 0;
        CurrentPhase = ProcessingPhase.Preparing;
        Elapsed = 0;
        StartTime = DateTime.Now;
        EndTime = null;

        _timer?.Stop();
        _timer = new System.Timers.Timer(1000);
        _timer.Elapsed += (_, _) => { Elapsed++; OnPropertyChanged(nameof(TotalTimeFormatted)); };
        _timer.AutoReset = true;
        _timer.Start();
    }

    public void FinishProcessing(IEnumerable<SkribeSegment> segments, string fileName)
    {
        _timer?.Stop();
        _timer = null;
        EndTime = DateTime.Now;
        Segments.Clear();
        foreach (var s in segments) Segments.Add(s);
        FileName = fileName;
        OnPropertyChanged(nameof(WordCount));
        OnPropertyChanged(nameof(SpeakerCount));
        Status = AppStatus.Done;
    }

    public void FailProcessing(string error)
    {
        _timer?.Stop();
        _timer = null;
        EndTime = DateTime.Now;
        Status = AppStatus.Error(error);
    }

    public void Reset()
    {
        _timer?.Stop();
        _timer = null;
        Status = AppStatus.Idle;
        Segments.Clear();
        FileName = string.Empty;
        ProgressMessage = string.Empty;
        TranscriptionProgress = 0;
        Elapsed = 0;
        StartTime = null;
        EndTime = null;
        AudioDuration = 0;
        SpeakerNames.Clear();
    }

    public string FormatElapsed(int sec)
    {
        if (sec < 60) return $"{sec}s";
        var m = sec / 60;
        var s = sec % 60;
        return s > 0 ? $"{m}m {s}s" : $"{m}m";
    }

    public string FormatClock(DateTime? dt) => dt?.ToString("HH:mm:ss") ?? "-";
}
