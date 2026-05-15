using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Threading.Tasks;

namespace Skribe.Services;

/// <summary>
/// Converts any audio/video into 16kHz mono 16-bit PCM WAV using ffmpeg as a subprocess.
/// ffmpeg is expected at $SKRIBE_FFMPEG (set by AppImage entry script) or on $PATH.
/// </summary>
public static class AudioProcessor
{
    private static string FfmpegPath =>
        Environment.GetEnvironmentVariable("SKRIBE_FFMPEG") ?? "ffmpeg";

    private static string FfprobePath =>
        Environment.GetEnvironmentVariable("SKRIBE_FFPROBE") ?? "ffprobe";

    public static async Task<string> ConvertToMono16kHzAsync(string inputPath)
    {
        var outputPath = Path.Combine(Path.GetTempPath(), $"skribe_{Guid.NewGuid():N}.wav");

        var psi = new ProcessStartInfo
        {
            FileName = FfmpegPath,
            RedirectStandardError = true,
            RedirectStandardOutput = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        psi.ArgumentList.Add("-y");                 // overwrite if exists
        psi.ArgumentList.Add("-loglevel"); psi.ArgumentList.Add("error");
        psi.ArgumentList.Add("-i"); psi.ArgumentList.Add(inputPath);
        psi.ArgumentList.Add("-vn");                // no video
        psi.ArgumentList.Add("-ac"); psi.ArgumentList.Add("1");
        psi.ArgumentList.Add("-ar"); psi.ArgumentList.Add("16000");
        psi.ArgumentList.Add("-c:a"); psi.ArgumentList.Add("pcm_s16le");
        psi.ArgumentList.Add("-f"); psi.ArgumentList.Add("wav");
        psi.ArgumentList.Add(outputPath);

        using var proc = Process.Start(psi)
            ?? throw new SkribeException($"Falha ao iniciar ffmpeg ({FfmpegPath}). Instale ffmpeg.");
        var stderr = await proc.StandardError.ReadToEndAsync();
        await proc.WaitForExitAsync();
        if (proc.ExitCode != 0)
            throw new SkribeException($"ffmpeg falhou: {stderr.Trim()}");

        return outputPath;
    }

    /// <summary>
    /// Reads a 16kHz mono 16-bit PCM WAV file as float[] in [-1, 1].
    /// We just produced the file ourselves with these exact specs, so a tiny parser is enough.
    /// </summary>
    public static async Task<float[]> LoadAudioAsFloatArrayAsync(string wavPath)
    {
        return await Task.Run(() =>
        {
            using var fs = File.OpenRead(wavPath);
            using var br = new BinaryReader(fs);

            // Find the "data" chunk (skip RIFF/fmt headers without strict parsing).
            // RIFF + 4 bytes size + "WAVE"
            if (br.ReadUInt32() != 0x46464952) // "RIFF"
                throw new SkribeException("WAV inválido: cabeçalho RIFF ausente");
            br.ReadUInt32(); // file size
            if (br.ReadUInt32() != 0x45564157) // "WAVE"
                throw new SkribeException("WAV inválido: marca WAVE ausente");

            int dataLength = 0;
            while (fs.Position < fs.Length)
            {
                uint chunkId = br.ReadUInt32();
                int chunkSize = br.ReadInt32();
                if (chunkId == 0x61746164) // "data"
                {
                    dataLength = chunkSize;
                    break;
                }
                fs.Position += chunkSize;
            }
            if (dataLength == 0)
                throw new SkribeException("WAV inválido: chunk 'data' não encontrado");

            int sampleCount = dataLength / 2; // int16 samples
            var samples = new float[sampleCount];
            for (int i = 0; i < sampleCount; i++)
            {
                short s = br.ReadInt16();
                samples[i] = s / 32768f;
            }
            return samples;
        });
    }

    public static async Task<double> GetDurationAsync(string path)
    {
        var psi = new ProcessStartInfo
        {
            FileName = FfprobePath,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        psi.ArgumentList.Add("-v"); psi.ArgumentList.Add("error");
        psi.ArgumentList.Add("-show_entries"); psi.ArgumentList.Add("format=duration");
        psi.ArgumentList.Add("-of"); psi.ArgumentList.Add("default=noprint_wrappers=1:nokey=1");
        psi.ArgumentList.Add(path);

        using var proc = Process.Start(psi)
            ?? throw new SkribeException($"Falha ao iniciar ffprobe ({FfprobePath}).");
        var stdout = await proc.StandardOutput.ReadToEndAsync();
        await proc.WaitForExitAsync();

        if (double.TryParse(stdout.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var dur))
            return dur;
        return 0;
    }

    public static void Cleanup(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); } catch { /* ignore */ }
    }
}
