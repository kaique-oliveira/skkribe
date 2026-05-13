using System;
using System.IO;
using System.Threading.Tasks;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace Skribe.Services;

/// <summary>
/// Converts any audio (MP3/M4A/WAV/WMA/AAC) into a 16kHz mono 16-bit WAV for Whisper.
/// Uses NAudio MediaFoundationReader (Windows native codecs) + WaveFormatConversionStream.
/// </summary>
public static class AudioProcessor
{
    public static async Task<string> ConvertToMono16kHzAsync(string inputPath)
    {
        var outputPath = Path.Combine(Path.GetTempPath(), $"skribe_{Guid.NewGuid():N}.wav");

        await Task.Run(() =>
        {
            using var reader = OpenReader(inputPath);
            // Step 1: ensure float32 sample provider so we can resample cleanly
            ISampleProvider sampleProvider = reader.ToSampleProvider();

            // Step 2: mix to mono if needed
            if (sampleProvider.WaveFormat.Channels > 1)
                sampleProvider = new StereoToMonoSampleProvider(sampleProvider) { LeftVolume = 0.5f, RightVolume = 0.5f };

            // Step 3: resample to 16 kHz if needed
            if (sampleProvider.WaveFormat.SampleRate != 16_000)
                sampleProvider = new WdlResamplingSampleProvider(sampleProvider, 16_000);

            // Step 4: write 16-bit PCM WAV
            var pcm16 = sampleProvider.ToWaveProvider16();
            WaveFileWriter.CreateWaveFile(outputPath, pcm16);
        });

        return outputPath;
    }

    public static async Task<float[]> LoadAudioAsFloatArrayAsync(string wavPath)
    {
        return await Task.Run(() =>
        {
            using var reader = new AudioFileReader(wavPath);
            // AudioFileReader exposes Float32 samples regardless of source bit depth
            var samples = new float[reader.Length / sizeof(float)];
            int read = reader.Read(samples, 0, samples.Length);
            if (read < samples.Length)
            {
                Array.Resize(ref samples, read);
            }
            return samples;
        });
    }

    public static async Task<double> GetDurationAsync(string path)
    {
        return await Task.Run(() =>
        {
            using var reader = OpenReader(path);
            return reader.TotalTime.TotalSeconds;
        });
    }

    public static void Cleanup(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); } catch { /* ignore */ }
    }

    private static WaveStream OpenReader(string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        return ext switch
        {
            ".wav" => new WaveFileReader(path),
            ".mp3" => new Mp3FileReader(path),
            ".aiff" or ".aif" => new AiffFileReader(path),
            // Everything else (m4a, aac, wma, mp4, mov, flac) → Media Foundation
            _ => new MediaFoundationReader(path)
        };
    }
}
