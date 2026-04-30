#!/usr/bin/env python3
"""
diarize.py — Diarização + transcrição com pyannote.audio
Uso: python diarize.py <audio.wav> <hf_token> <whisper_json_path>
Saída: última linha do stdout é JSON com segmentos { start, end, speaker, text }
"""

import sys
import json
import os
import re
import warnings

warnings.filterwarnings("ignore")
sys.stdout.reconfigure(line_buffering=True)

def progress(msg):
    print(msg, file=sys.stderr, flush=True)

def result(data):
    print(json.dumps(data), flush=True)

def parse_annotation(diarization):
    """Extrai segmentos de qualquer versão do pyannote."""
    segments = []

    # Estratégia 1: API clássica — Annotation direto
    if hasattr(diarization, 'itertracks'):
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            segments.append({"start": turn.start, "end": turn.end, "speaker": speaker})
        return segments

    # Estratégia 2: DiarizeOutput (pyannote >= 3.x)
    if hasattr(diarization, 'speaker_diarization'):
        ann = diarization.speaker_diarization
        for turn, _, speaker in ann.itertracks(yield_label=True):
            segments.append({"start": turn.start, "end": turn.end, "speaker": speaker})
        return segments

    # Estratégia 3: iteração direta
    try:
        for segment, _, speaker in diarization:
            segments.append({"start": segment.start, "end": segment.end, "speaker": speaker})
        if segments:
            return segments
    except Exception:
        pass

    return segments

def rename_speakers(segments):
    """
    Renomeia os rótulos brutos do pyannote (ex: SPEAKER_00) para
    nomes em português como "Pessoa 1", "Pessoa 2", etc.
    A ordem segue a primeira aparição de cada falante no áudio.
    """
    speaker_map = {}
    counter = [1]

    def get_name(raw):
        if raw not in speaker_map:
            speaker_map[raw] = f"Pessoa {counter[0]}"
            counter[0] += 1
        return speaker_map[raw]

    for seg in segments:
        seg["speaker"] = get_name(seg["speaker"])

    return segments

def assign_speakers(diar_segments, whisper_segments):
    """
    Para cada segmento do whisper, encontra o falante do pyannote
    com maior sobreposição temporal.
    """
    result_segments = []

    for ws in whisper_segments:
        w_start = ws.get("start", 0)
        w_end   = ws.get("end", w_start + 1)
        text    = ws.get("text", "").strip()

        if not text:
            continue

        # Calcula sobreposição com cada segmento do pyannote
        best_speaker = None
        best_overlap = 0.0

        for ds in diar_segments:
            overlap = max(0, min(w_end, ds["end"]) - max(w_start, ds["start"]))
            if overlap > best_overlap:
                best_overlap = overlap
                best_speaker = ds["speaker"]

        # Fallback: falante do segmento mais próximo
        if best_speaker is None and diar_segments:
            mid = (w_start + w_end) / 2
            closest = min(diar_segments, key=lambda d: abs((d["start"] + d["end"]) / 2 - mid))
            best_speaker = closest["speaker"]

        result_segments.append({
            "start":   round(w_start, 2),
            "end":     round(w_end, 2),
            "speaker": best_speaker or "Pessoa 1",
            "text":    text,
        })

    return result_segments

def main():
    if len(sys.argv) < 4:
        result({"error": "Uso: diarize.py <audio.wav> <hf_token> <whisper_json>"})
        sys.exit(1)

    audio_path       = sys.argv[1]
    hf_token         = sys.argv[2]
    whisper_json_path = sys.argv[3]

    if not os.path.exists(audio_path):
        result({"error": f"Arquivo não encontrado: {audio_path}"})
        sys.exit(1)

    if not os.path.exists(whisper_json_path):
        result({"error": f"JSON do whisper não encontrado: {whisper_json_path}"})
        sys.exit(1)

    # Lê segmentos do whisper (com timestamps)
    with open(whisper_json_path, "r", encoding="utf-8") as f:
        whisper_data = json.load(f)
    whisper_segments = whisper_data.get("transcription", [])

    # Converte formato whisper-cli JSON para lista simples
    # whisper-cli usa: [{ "offsets": {"from": ms, "to": ms}, "text": "..." }]
    normalized = []
    for seg in whisper_segments:
        offsets = seg.get("offsets", {})
        normalized.append({
            "start": offsets.get("from", 0) / 1000.0,
            "end":   offsets.get("to",   0) / 1000.0,
            "text":  seg.get("text", "").strip(),
        })

    try:
        progress("Carregando pyannote.audio...")
        from pyannote.audio import Pipeline
        import pyannote.audio as pa
    except ImportError:
        result({"error": "pyannote.audio não instalado. Execute o setup de diarização no app."})
        sys.exit(1)

    try:
        progress("Carregando modelo de identificação de vozes...")
        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            token=hf_token
        )

        try:
            import torch
            if torch.backends.mps.is_available():
                progress("Usando GPU Apple Silicon — vai ser rápido!")
                pipeline = pipeline.to(torch.device("mps"))
            else:
                progress("Usando CPU — pode levar alguns minutos, aguenta aí...")
        except Exception:
            pass

        progress("Analisando vozes... ouvindo o áudio com atenção")
        output = pipeline(audio_path)

        progress("Vozes identificadas! Combinando com a transcrição...")
        diar_segments = parse_annotation(output)

        if not diar_segments:
            result({"error": "Não foi possível identificar as vozes no áudio."})
            sys.exit(1)

        # Cruza timestamps do pyannote com texto do whisper
        final_segments = assign_speakers(diar_segments, normalized)

        # Renomeia para português
        final_segments = rename_speakers(final_segments)

        progress(f"Pronto! {len(set(s['speaker'] for s in final_segments))} pessoas, {len(final_segments)} falas encontradas.")
        result({"segments": final_segments})

    except Exception as e:
        result({"error": str(e)})
        sys.exit(1)

if __name__ == "__main__":
    main()
