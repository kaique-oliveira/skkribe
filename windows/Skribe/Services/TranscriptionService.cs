using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Whisper.net;
using Whisper.net.Ggml;

namespace Skribe.Services;

public sealed class TranscriptionService : IAsyncDisposable
{
    public sealed record WordTiming(double Start, double End, string Word);
    public sealed record SegmentWithWords(double Start, double End, string Text, IReadOnlyList<WordTiming> Words);

    private readonly string _modelPath;
    private WhisperFactory? _factory;

    public TranscriptionService(string modelPath) { _modelPath = modelPath; }

    public Task LoadAsync()
    {
        return Task.Run(() =>
        {
            _factory = WhisperFactory.FromPath(_modelPath);
        });
    }

    public async Task<IReadOnlyList<SegmentWithWords>> TranscribeAsync(string wavPath)
    {
        if (_factory is null) throw new SkribeException("Whisper não carregado");

        await using var processor = _factory.CreateBuilder()
            .WithLanguage("pt")             // force Portuguese (parity with Mac)
            .WithTokenTimestamps()          // produces word-ish timestamps inside Segments
            .WithThreads(Math.Max(1, Environment.ProcessorCount - 1))
            .Build();

        var results = new List<SegmentWithWords>();
        await using var fs = File.OpenRead(wavPath);

        await foreach (var segment in processor.ProcessAsync(fs))
        {
            // Whisper.net's SegmentData exposes Start/End TimeSpan and Text;
            // word-level timing inside Tokens is approximate but workable.
            var words = new List<WordTiming>();
            if (segment.Tokens is { Count: > 0 } tokens)
            {
                foreach (var t in tokens)
                {
                    if (string.IsNullOrWhiteSpace(t.Text)) continue;
                    words.Add(new WordTiming(
                        t.Start.TotalSeconds,
                        t.End.TotalSeconds,
                        t.Text));
                }
            }

            results.Add(new SegmentWithWords(
                segment.Start.TotalSeconds,
                segment.End.TotalSeconds,
                segment.Text.Trim(),
                words));
        }

        return results;
    }

    public async ValueTask DisposeAsync()
    {
        if (_factory != null) await _factory.DisposeAsync();
    }
}
