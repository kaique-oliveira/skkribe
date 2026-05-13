using System;
using System.Collections.Generic;

namespace Skribe.Services;

/// <summary>
/// Lightweight energy-based VAD. Mirrors the Swift implementation:
/// produces speech segments to avoid wasting whisper time on silence.
/// </summary>
public static class VADProcessor
{
    public sealed record VoiceSegment(double StartTime, double EndTime);

    private const int SampleRate = 16_000;
    private const int FrameMs = 30;
    private const int FrameSamples = SampleRate * FrameMs / 1000; // 480
    private const float EnergyThreshold = 0.005f;
    private const int MinSpeechFrames = 5;   // ~150 ms
    private const int MinSilenceFrames = 20; // ~600 ms

    public static List<VoiceSegment> DetectVoiceActivity(float[] samples)
    {
        var result = new List<VoiceSegment>();
        if (samples.Length == 0) return result;

        bool inSpeech = false;
        int speechFrameCount = 0;
        int silenceFrameCount = 0;
        int segmentStart = 0;

        for (int frameStart = 0; frameStart + FrameSamples <= samples.Length; frameStart += FrameSamples)
        {
            double energy = 0;
            for (int i = 0; i < FrameSamples; i++)
            {
                var s = samples[frameStart + i];
                energy += s * s;
            }
            energy = Math.Sqrt(energy / FrameSamples);

            bool isSpeech = energy > EnergyThreshold;

            if (isSpeech)
            {
                if (!inSpeech)
                {
                    speechFrameCount++;
                    if (speechFrameCount >= MinSpeechFrames)
                    {
                        inSpeech = true;
                        segmentStart = frameStart - (speechFrameCount - 1) * FrameSamples;
                        silenceFrameCount = 0;
                    }
                }
                else
                {
                    silenceFrameCount = 0;
                }
            }
            else if (inSpeech)
            {
                silenceFrameCount++;
                if (silenceFrameCount >= MinSilenceFrames)
                {
                    int segEnd = frameStart - silenceFrameCount * FrameSamples;
                    result.Add(new VoiceSegment(
                        (double)segmentStart / SampleRate,
                        (double)segEnd / SampleRate));
                    inSpeech = false;
                    speechFrameCount = 0;
                    silenceFrameCount = 0;
                }
            }
            else
            {
                speechFrameCount = 0;
            }
        }

        if (inSpeech)
        {
            result.Add(new VoiceSegment(
                (double)segmentStart / SampleRate,
                (double)samples.Length / SampleRate));
        }

        return result;
    }
}
