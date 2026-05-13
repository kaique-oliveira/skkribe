namespace Skribe.Models;

public enum AppStatusKind
{
    Loading,
    Idle,
    Working,
    Done,
    Error,
    Settings
}

public sealed record AppStatus(AppStatusKind Kind, string? Message = null)
{
    public static readonly AppStatus Idle = new(AppStatusKind.Idle);
    public static readonly AppStatus Working = new(AppStatusKind.Working);
    public static readonly AppStatus Done = new(AppStatusKind.Done);
    public static readonly AppStatus Settings = new(AppStatusKind.Settings);
    public static AppStatus Loading(string msg) => new(AppStatusKind.Loading, msg);
    public static AppStatus Error(string msg) => new(AppStatusKind.Error, msg);
}

public enum ProcessingPhase
{
    Preparing = 0,
    Transcribing = 1,
    Diarizing = 2,
    Merging = 3
}

public static class ProcessingPhaseExt
{
    public static string Label(this ProcessingPhase p) => p switch
    {
        ProcessingPhase.Preparing => "Preparando o áudio",
        ProcessingPhase.Transcribing => "Ouvindo com atenção",
        ProcessingPhase.Diarizing => "Reconhecendo as vozes",
        ProcessingPhase.Merging => "Juntando tudo",
        _ => string.Empty
    };

    public static string Detail(this ProcessingPhase p) => p switch
    {
        ProcessingPhase.Preparing => "Convertendo para o formato ideal...",
        ProcessingPhase.Transcribing => "Identificando cada palavra do áudio...",
        ProcessingPhase.Diarizing => "Descobrindo quem está falando em cada trecho...",
        ProcessingPhase.Merging => "Associando as falas com cada pessoa...",
        _ => string.Empty
    };

    public static string Icon(this ProcessingPhase p) => p switch
    {
        // WinUI 3 uses Segoe MDL2 / Segoe Fluent icon glyph codes
        ProcessingPhase.Preparing => "",     // Headphones-like
        ProcessingPhase.Transcribing => "", // Edit pencil
        ProcessingPhase.Diarizing => "",    // People
        ProcessingPhase.Merging => "",      // Puzzle
        _ => ""
    };
}
