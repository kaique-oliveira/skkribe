using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;
using Skribe.Models;

namespace Skribe.Services;

/// <summary>
/// Downloads & caches:
///  - Whisper GGML models (ggml-small/medium/large-v3-turbo/large-v3) from HuggingFace
///  - sherpa-onnx PyAnnote diarization bundle (segmentation + speaker embedding)
/// Stores everything under $XDG_DATA_HOME/Skribe/Models (default ~/.local/share/Skribe/Models).
/// </summary>
public sealed class ModelManager
{
    public TranscriptionService TranscriptionService { get; private set; } = null!;
    public DiarizationService DiarizationService { get; private set; } = null!;

    private static readonly Dictionary<string, string> WhisperUrls = new()
    {
        ["ggml-small"]          = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
        ["ggml-medium"]         = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin",
        ["ggml-large-v3-turbo"] = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin",
        ["ggml-large-v3"]       = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin",
    };

    public static string ModelsDir
    {
        get
        {
            var xdg = Environment.GetEnvironmentVariable("XDG_DATA_HOME");
            var baseDir = string.IsNullOrWhiteSpace(xdg)
                ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".local", "share")
                : xdg;
            var dir = Path.Combine(baseDir, "Skribe", "Models");
            Directory.CreateDirectory(dir);
            return dir;
        }
    }

    public async Task PrepareAsync(string modelName, AppState state, IProgress<double>? progress = null)
    {
        state.Status = AppStatus.Loading("Preparando modelos...");
        state.LoadingProgress = 0;

        if (!WhisperUrls.TryGetValue(modelName, out var whisperUrl))
            throw new SkribeException($"Modelo desconhecido: {modelName}");

        var whisperPath = Path.Combine(ModelsDir, modelName + ".bin");
        if (!File.Exists(whisperPath))
        {
            state.Status = AppStatus.Loading($"Baixando {modelName}...");
            await DownloadAsync(whisperUrl, whisperPath, p =>
            {
                state.LoadingProgress = p * 0.7;
            });
        }
        else
        {
            state.LoadingProgress = 0.7;
        }

        var segPath = Path.Combine(ModelsDir, "pyannote-segmentation-3.0.onnx");
        var embPath = Path.Combine(ModelsDir, "speaker-embedding.onnx");
        state.LoadingProgress = 1.0;

        TranscriptionService = new TranscriptionService(whisperPath);
        await TranscriptionService.LoadAsync();
        DiarizationService = new DiarizationService(segPath, embPath);

        state.Status = AppStatus.Idle;
    }

    private static async Task DownloadAsync(string url, string destination, Action<double>? onProgress)
    {
        var temp = destination + ".part";
        using var http = new HttpClient();
        using var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();
        var total = response.Content.Headers.ContentLength ?? -1L;

        await using var src = await response.Content.ReadAsStreamAsync();
        await using (var dst = File.Create(temp))
        {
            var buffer = new byte[81920];
            long received = 0;
            int read;
            while ((read = await src.ReadAsync(buffer)) > 0)
            {
                await dst.WriteAsync(buffer.AsMemory(0, read));
                received += read;
                if (total > 0) onProgress?.Invoke((double)received / total);
            }
        }
        File.Move(temp, destination, overwrite: true);
    }
}
