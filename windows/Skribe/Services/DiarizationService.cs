using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using SherpaOnnx;

namespace Skribe.Services;

/// <summary>
/// Speaker diarization using sherpa-onnx + PyAnnote 3.0 segmentation + 3D-Speaker embeddings.
/// If models aren't present yet (first run), falls back to "everyone is SPEAKER_0".
/// </summary>
public sealed class DiarizationService
{
    public sealed record SpeakerSegmentResult(double Start, double End, int SpeakerId);

    private readonly string _segPath;
    private readonly string _embPath;

    public DiarizationService(string segmentationModel, string speakerEmbeddingModel)
    {
        _segPath = segmentationModel;
        _embPath = speakerEmbeddingModel;
    }

    public async Task<IReadOnlyList<SpeakerSegmentResult>> DiarizeAsync(float[] samples, int sampleRate = 16_000)
    {
        if (!File.Exists(_segPath) || !File.Exists(_embPath))
        {
            // Graceful fallback — pipeline still completes with single speaker.
            return new[] { new SpeakerSegmentResult(0, samples.Length / (double)sampleRate, 0) };
        }

        return await Task.Run(() =>
        {
            var config = new OfflineSpeakerDiarizationConfig
            {
                Segmentation = new OfflineSpeakerSegmentationModelConfig
                {
                    Pyannote = new OfflineSpeakerSegmentationPyannoteModelConfig { Model = _segPath }
                },
                Embedding = new SpeakerEmbeddingExtractorConfig { Model = _embPath },
                Clustering = new FastClusteringConfig { NumClusters = -1, Threshold = 0.5f },
                MinDurationOn = 0.3f,
                MinDurationOff = 0.5f
            };

            using var diarizer = new OfflineSpeakerDiarization(config);
            var segments = diarizer.Process(samples);

            var list = new List<SpeakerSegmentResult>(segments.Length);
            foreach (var s in segments)
            {
                list.Add(new SpeakerSegmentResult(s.Start, s.End, s.Speaker));
            }
            return (IReadOnlyList<SpeakerSegmentResult>)list;
        });
    }
}
