#!/usr/bin/env python3
# Diarize an audio file via pyannote.audio (community-1) and assign each whisper
# segment (or word, when available) to a speaker. Output: one JSON line on
# stdout with the final speaker-tagged segments. Progress + diagnostics go to
# stderr.
#
# Usage:
#   diarize.py <audio.wav> <hf_token> <whisper_json>
#              [--num-speakers=N | --min-speakers=N | --max-speakers=N]
#              [--wait-json]
#
# The whisper JSON is the shape produced by main/index.js, a list of
# segments with .start / .end / .text plus an optional .words array.
#
# --wait-json lets the Electron main process launch this script BEFORE whisper
# has finished: diarization (the slow part, needs only the WAV) runs in
# parallel with transcription, and we only block waiting for the whisper JSON
# right before the fast final assignment step. The main process writes the
# JSON atomically (tmp file + rename), so existence == complete.
import sys, json, os, time, warnings
warnings.filterwarnings("ignore")
sys.stdout.reconfigure(line_buffering=True)

def progress(m): print(m, file=sys.stderr, flush=True)
def result(d):   print(json.dumps(d), flush=True)


def merge_minor_speakers(diar, min_total_sec=5.0, min_fraction=0.04):
    """
    Catches pyannote's common 'phantom speaker' failure: clustering produces
    N+1 speakers but one of them is barely present (a handful of short turns
    totaling a few seconds, almost always a misclassified blip of an existing
    speaker). Such a speaker inflates the perceived speaker count and steals
    sentences that obviously belong to someone else.

    Rule: a speaker whose total active time is < min_total_sec OR < min_fraction
    of the total speech is reassigned, per-turn, to the temporally-closest
    non-minor speaker. Stops when none qualify.
    """
    if not diar: return diar

    totals = {}
    for d in diar:
        totals[d["speaker"]] = totals.get(d["speaker"], 0) + (d["end"] - d["start"])
    grand_total = sum(totals.values())
    if grand_total <= 0: return diar

    minor = {sp for sp, t in totals.items()
             if t < min_total_sec or (t / grand_total) < min_fraction}
    # Don't strip everyone, if every speaker is below threshold (very short
    # clip), keep the original assignments.
    if not minor or len(minor) >= len(totals):
        return diar

    non_minor_turns = [d for d in diar if d["speaker"] not in minor]
    out = []
    for d in diar:
        if d["speaker"] not in minor:
            out.append(d)
            continue
        mid = (d["start"] + d["end"]) / 2
        nearest = min(
            non_minor_turns,
            key=lambda x: abs((x["start"] + x["end"]) / 2 - mid),
        )
        out.append({"start": d["start"], "end": d["end"], "speaker": nearest["speaker"]})
    return out


def smooth_diar(diar, min_dur=0.5):
    """
    Constrained re-segmentation: a turn of speaker X shorter than min_dur that's
    sandwiched between two turns of speaker Y is almost always a clustering
    blip, not a real interjection. Fuse the trio into one extended Y turn.
    Iterates to fixpoint because each fusion can expose another blip.
    """
    if len(diar) < 3: return diar
    out = list(diar)
    changed = True
    while changed:
        changed = False
        i = len(out) - 2
        while i >= 1:
            prev, cur, nxt = out[i-1], out[i], out[i+1]
            short = (cur["end"] - cur["start"]) < min_dur
            sandwich = prev["speaker"] == nxt["speaker"] and cur["speaker"] != prev["speaker"]
            if short and sandwich:
                out[i-1] = {"start": prev["start"], "end": nxt["end"], "speaker": prev["speaker"]}
                del out[i+1]; del out[i]
                changed = True
                i = min(i - 1, len(out) - 2)
            else:
                i -= 1
    return out


def speaker_for_range(start, end, diar):
    """Return the speaker with the maximum temporal overlap with [start, end].
    Falls back to the turn whose midpoint is closest when no overlap exists."""
    if not diar: return None
    by_speaker = {}
    for d in diar:
        ov = max(0, min(end, d["end"]) - max(start, d["start"]))
        if ov > 0:
            by_speaker[d["speaker"]] = by_speaker.get(d["speaker"], 0) + ov
    if by_speaker:
        return max(by_speaker, key=by_speaker.get)
    mid = (start + end) / 2
    return min(diar, key=lambda d: abs((d["start"] + d["end"]) / 2 - mid))["speaker"]


def smooth_word_speakers(speakers, min_run=3):
    """Hysteresis: a run of < min_run consecutive words tagged with speaker X,
    flanked by two runs of the SAME other speaker Y, is just noise, relabel
    the short run to Y. Strict criterion (both sides must agree) prevents
    overzealous smoothing across genuine speaker changes."""
    if len(speakers) < 2 * min_run + 1: return speakers
    out = list(speakers)
    changed = True
    while changed:
        changed = False
        i = 0
        while i < len(out):
            j = i
            while j < len(out) and out[j] == out[i]: j += 1
            run = j - i
            if run < min_run and i > 0 and j < len(out) and out[i-1] == out[j]:
                target = out[i-1]
                for k in range(i, j): out[k] = target
                changed = True
            i = j
    return out


def assign_speakers_word_level(whisper_segments, diar):
    """For each whisper segment with word-level timings, assign per-word
    speakers via overlap, smooth with hysteresis, then re-group consecutive
    same-speaker words into output segments (splitting the original whisper
    segment wherever the speaker actually changes mid-sentence).

    Segments without word data fall back to segment-level max overlap."""
    out = []
    for seg in whisper_segments:
        text = seg.get("text", "").strip()
        if not text: continue
        words = seg.get("words") or []

        if not words:
            sp = speaker_for_range(seg["start"], seg["end"], diar)
            out.append({"start": seg["start"], "end": seg["end"], "speaker": sp, "text": text})
            continue

        word_speakers = [speaker_for_range(w["start"], w["end"], diar) for w in words]
        word_speakers = smooth_word_speakers(word_speakers, min_run=3)

        # Group consecutive words with same speaker → one output segment each.
        group_speaker, group_words, group_start = None, [], None
        def flush():
            nonlocal group_words
            if not group_words: return
            joined = " ".join(w["text"] for w in group_words).strip()
            if joined:
                out.append({
                    "start": group_start,
                    "end": group_words[-1]["end"],
                    "speaker": group_speaker,
                    "text": joined,
                })
            group_words = []

        for w, sp in zip(words, word_speakers):
            if sp == group_speaker:
                group_words.append(w)
            else:
                flush()
                group_speaker, group_words, group_start = sp, [w], w["start"]
        flush()
    return out


DIARIZATION_MODEL = "pyannote/speaker-diarization-community-1"

# How long to wait (in --wait-json mode) for whisper to deliver its JSON after
# diarization finishes. Whisper chunks are individually capped at 10 min by the
# main process, but total transcription time is unbounded for long audios, so
# be generous: the main process kills us on ITS failure paths anyway.
WAIT_JSON_TIMEOUT_S = 4 * 60 * 60


def load_pipeline(hf_token):
    from pyannote.audio import Pipeline
    try:
        # pyannote.audio >= 4 (community-1) uses the modern `token=` kwarg.
        return Pipeline.from_pretrained(DIARIZATION_MODEL, token=hf_token)
    except TypeError:
        # Older pyannote.audio still in an un-migrated venv: legacy kwarg.
        return Pipeline.from_pretrained(DIARIZATION_MODEL, use_auth_token=hf_token)


def extract_turns(diarization):
    """Normalize the pipeline output across pyannote versions into a plain
    [{start, end, speaker}] list.

    pyannote 4.x returns an object exposing .speaker_diarization plus
    .exclusive_speaker_diarization: the exclusive variant has no overlapping
    turns, which is exactly what word-level max-overlap assignment wants
    (overlap regions otherwise dilute the per-word vote). Prefer it, then the
    plain annotation, then the 3.x Annotation itself."""
    for candidate in (
        getattr(diarization, "exclusive_speaker_diarization", None),
        getattr(diarization, "speaker_diarization", None),
        diarization,
    ):
        if candidate is None or not hasattr(candidate, "itertracks"):
            continue
        diar = [
            {"start": turn.start, "end": turn.end, "speaker": sp}
            for turn, _, sp in candidate.itertracks(yield_label=True)
        ]
        if diar:
            return diar
    return []


def main():
    if len(sys.argv) < 4:
        result({"error": "Uso: diarize.py <audio.wav> <hf_token> <whisper_json> [--num-speakers=N ...] [--wait-json]"})
        sys.exit(1)

    audio_path, hf_token, whisper_json = sys.argv[1], sys.argv[2], sys.argv[3]
    kwargs, wait_json = {}, False
    for arg in sys.argv[4:]:
        if arg == "--wait-json":
            wait_json = True
            continue
        if not arg.startswith("--"): continue
        try:
            k, v = arg[2:].split("=", 1)
            kwargs[k.replace("-", "_")] = int(v)
        except Exception: pass

    if not os.path.exists(audio_path):
        result({"error": f"audio: {audio_path}"}); sys.exit(1)
    if not wait_json and not os.path.exists(whisper_json):
        result({"error": f"whisper json: {whisper_json}"}); sys.exit(1)

    try:
        progress("Carregando pyannote.audio...")
        import torch
        from pyannote.audio import Pipeline  # noqa: F401  (import check)
    except ImportError as e:
        result({"error": f"pyannote.audio não instalado: {e}"}); sys.exit(1)

    try:
        # On CPU, torch sometimes defaults to fewer intra-op threads than the
        # machine has cores; being explicit costs nothing and helps small boxes.
        try:
            torch.set_num_threads(max(1, os.cpu_count() or 1))
        except Exception:
            pass

        pipeline = load_pipeline(hf_token)
        if torch.backends.mps.is_available():
            progress("Usando MPS (GPU Apple Silicon)")
            pipeline = pipeline.to(torch.device("mps"))
        elif torch.cuda.is_available():
            progress("Usando CUDA")
            pipeline = pipeline.to(torch.device("cuda"))
        else:
            progress("Usando CPU")

        progress("Diarizando o áudio...")
        diarization = pipeline(audio_path, **kwargs)
        diar = extract_turns(diarization)

        if not diar:
            result({"error": "Não foi possível identificar vozes no áudio."}); sys.exit(1)

        # In parallel mode, whisper may still be transcribing: block only now,
        # after the heavy diarization work, right before the cheap assignment.
        if wait_json and not os.path.exists(whisper_json):
            progress("Vozes identificadas. Aguardando a transcrição terminar...")
            deadline = time.monotonic() + WAIT_JSON_TIMEOUT_S
            while not os.path.exists(whisper_json):
                if time.monotonic() > deadline:
                    result({"error": "Transcrição não terminou a tempo (whisper JSON ausente)."})
                    sys.exit(1)
                time.sleep(0.5)

        with open(whisper_json, encoding="utf-8") as f:
            wd = json.load(f)

        # Normalize whisper input (start/end in seconds + words array).
        whisper_segments = []
        for s in wd.get("transcription", []):
            off = s.get("offsets", {})
            whisper_segments.append({
                "start": off.get("from", 0) / 1000.0,
                "end":   off.get("to", 0)   / 1000.0,
                "text":  s.get("text", "").strip(),
                "words": s.get("words") or [],
            })

        # Order matters here: fold phantom speakers into their nearest real
        # neighbor FIRST (otherwise smooth_diar's "same-speaker sandwich" rule
        # never fires for a blip whose neighbors are flagged as the phantom
        # speaker itself). Then smooth out residual sub-500ms blips.
        diar = merge_minor_speakers(diar)
        diar = smooth_diar(diar)

        # Hybrid word-level + hysteresis assignment.
        out = assign_speakers_word_level(whisper_segments, diar)

        # Rename to "Pessoa N" in encounter order.
        speaker_map, counter = {}, [1]
        for s in out:
            sp = s["speaker"]
            if sp not in speaker_map:
                speaker_map[sp] = f"Pessoa {counter[0]}"; counter[0] += 1
            s["speaker"] = speaker_map[sp]
            s["start"] = round(s["start"], 2)
            s["end"]   = round(s["end"], 2)

        progress(f"Pronto: {len(speaker_map)} pessoas, {len(out)} falas")
        result({"segments": out})

    except Exception as e:
        result({"error": str(e)}); sys.exit(1)


if __name__ == "__main__": main()
