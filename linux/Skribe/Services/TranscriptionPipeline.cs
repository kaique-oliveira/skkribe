using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Avalonia.Threading;
using Skribe.Models;

namespace Skribe.Services;

public sealed class TranscriptionPipeline
{
    public async Task ProcessAsync(string filePath, AppState state, ModelManager models)
    {
        Run(() =>
        {
            state.StartProcessing();
            state.FileName = System.IO.Path.GetFileName(filePath);
        });

        string? wavPath = null;
        try
        {
            Run(() => { state.CurrentPhase = ProcessingPhase.Preparing; state.ProgressMessage = "Convertendo áudio..."; });
            wavPath = await AudioProcessor.ConvertToMono16kHzAsync(filePath);

            var duration = await AudioProcessor.GetDurationAsync(wavPath);
            Run(() =>
            {
                state.AudioDuration = duration;
                state.ProgressMessage = $"Áudio preparado ({(int)duration / 60}min {(int)(duration % 60)}s)";
            });

            Run(() => { state.CurrentPhase = ProcessingPhase.Transcribing; state.ProgressMessage = "Analisando áudio..."; });
            var samples = await AudioProcessor.LoadAudioAsFloatArrayAsync(wavPath);

            var voiceSegs = VADProcessor.DetectVoiceActivity(samples);
            var voiceDur = voiceSegs.Sum(v => v.EndTime - v.StartTime);
            if (voiceDur < 1.0)
                throw new SkribeException("Nenhuma fala detectada no áudio");

            Run(() => state.ProgressMessage = $"Voz detectada: {(int)voiceDur}s de fala em {(int)duration}s totais");

            var transcribeTask = models.TranscriptionService.TranscribeAsync(wavPath);
            var diarizeTask = models.DiarizationService.DiarizeAsync(samples);

            Run(() => { state.CurrentPhase = ProcessingPhase.Diarizing; state.ProgressMessage = "Transcrevendo e identificando vozes em paralelo..."; });

            await Task.WhenAll(transcribeTask, diarizeTask);
            var whisperSegments = await transcribeTask;
            var diarSegments = await diarizeTask;

            Run(() => { state.CurrentPhase = ProcessingPhase.Merging; state.ProgressMessage = "Combinando transcrição com vozes..."; });
            var merged = AssignSpeakersWordLevel(whisperSegments, diarSegments);
            var renamed = RenameSpeakers(merged);

            Run(() => state.FinishProcessing(renamed, System.IO.Path.GetFileName(filePath)));
        }
        catch (Exception ex)
        {
            Run(() => state.FailProcessing(ex.Message));
        }
        finally
        {
            if (wavPath != null) AudioProcessor.Cleanup(wavPath);
        }
    }

    private static void Run(Action action)
    {
        if (Dispatcher.UIThread.CheckAccess()) action();
        else Dispatcher.UIThread.Post(action);
    }

    private static List<SkribeSegment> AssignSpeakersWordLevel(
        IReadOnlyList<TranscriptionService.SegmentWithWords> whisperSegs,
        IReadOnlyList<DiarizationService.SpeakerSegmentResult> diarSegs)
    {
        var result = new List<SkribeSegment>();

        foreach (var seg in whisperSegs)
        {
            if (seg.Words.Count > 0)
            {
                int? curSpeaker = null;
                var curWords = new List<TranscriptionService.WordTiming>();
                double? curStart = null;

                foreach (var w in seg.Words)
                {
                    var mid = (w.Start + w.End) / 2.0;
                    var spk = FindSpeakerAt(mid, diarSegs);
                    if (spk != curSpeaker)
                    {
                        if (curWords.Count > 0 && curStart is double s && curSpeaker is int sp)
                        {
                            result.Add(new SkribeSegment(s, curWords[^1].End, $"SPEAKER_{sp}",
                                string.Concat(curWords.Select(x => x.Word)).Trim()));
                        }
                        curSpeaker = spk;
                        curWords = new List<TranscriptionService.WordTiming> { w };
                        curStart = w.Start;
                    }
                    else curWords.Add(w);
                }
                if (curWords.Count > 0 && curStart is double s2 && curSpeaker is int sp2)
                {
                    result.Add(new SkribeSegment(s2, curWords[^1].End, $"SPEAKER_{sp2}",
                        string.Concat(curWords.Select(x => x.Word)).Trim()));
                }
            }
            else
            {
                var text = seg.Text.Trim();
                if (string.IsNullOrEmpty(text)) continue;
                int? bestSpeaker = null;
                double bestOverlap = 0;
                foreach (var d in diarSegs)
                {
                    var overlap = Math.Max(0, Math.Min(seg.End, d.End) - Math.Max(seg.Start, d.Start));
                    if (overlap > bestOverlap) { bestOverlap = overlap; bestSpeaker = d.SpeakerId; }
                }
                if (bestSpeaker is null && diarSegs.Count > 0)
                    bestSpeaker = FindSpeakerAt((seg.Start + seg.End) / 2, diarSegs);
                result.Add(new SkribeSegment(seg.Start, seg.End, $"SPEAKER_{bestSpeaker ?? 0}", text));
            }
        }

        return result;
    }

    private static int FindSpeakerAt(double t, IReadOnlyList<DiarizationService.SpeakerSegmentResult> segs)
    {
        foreach (var s in segs)
            if (t >= s.Start && t <= s.End) return s.SpeakerId;
        if (segs.Count == 0) return 0;
        var closest = segs.OrderBy(s => Math.Abs(t - (s.Start + s.End) / 2)).First();
        return closest.SpeakerId;
    }

    private static List<SkribeSegment> RenameSpeakers(IReadOnlyList<SkribeSegment> segs)
    {
        var map = new Dictionary<string, string>();
        int counter = 1;
        var output = new List<SkribeSegment>(segs.Count);
        foreach (var s in segs)
        {
            if (!map.ContainsKey(s.Speaker)) map[s.Speaker] = $"Pessoa {counter++}";
            output.Add(new SkribeSegment(s.Start, s.End, map[s.Speaker], s.Text));
        }
        return output;
    }
}
