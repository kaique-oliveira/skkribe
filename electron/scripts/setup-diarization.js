#!/usr/bin/env node
/**
 * setup-diarization.js — sets up an isolated Python venv with pyannote.audio
 * + PyTorch CPU and pre-downloads the pyannote/speaker-diarization-3.1 model
 * weights. Same architecture as the original Skribe-electron build.
 *
 * Run: npm run setup:diarization -- --token=hf_xxxxxxxxxxxx
 *
 * The HF token is needed once to fetch the gated model. Accept the licenses at:
 *   https://huggingface.co/pyannote/segmentation-3.0
 *   https://huggingface.co/pyannote/speaker-diarization-3.1
 *   https://huggingface.co/pyannote/wespeaker-voxceleb-resnet34-LM
 * before generating the token at https://huggingface.co/settings/tokens.
 */

const { execSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const PY_DIR = path.join(ROOT, 'resources', 'python')
const VENV_DIR = path.join(PY_DIR, 'venv')
const VENV_BIN = process.platform === 'win32' ? 'Scripts' : 'bin'
const VENV_PY  = path.join(VENV_DIR, VENV_BIN, process.platform === 'win32' ? 'python.exe' : 'python')
const VENV_PIP = path.join(VENV_DIR, VENV_BIN, process.platform === 'win32' ? 'pip.exe' : 'pip')
const DIARIZE_PY = path.join(PY_DIR, 'diarize.py')
const CONFIG = path.join(PY_DIR, '.diarization-config.json')

const DIARIZE_SCRIPT = `#!/usr/bin/env python3
# Diarize an audio file via pyannote.audio 3.1 and assign each whisper segment
# (or word, when available) to a speaker. Output: one JSON line on stdout with
# the final speaker-tagged segments. Progress + diagnostics go to stderr.
#
# Usage:
#   diarize.py <audio.wav> <hf_token> <whisper_json>
#              [--num-speakers=N | --min-speakers=N | --max-speakers=N]
#
# The whisper JSON is the shape produced by main/index.js — a list of
# segments with .start / .end / .text plus an optional .words array.
import sys, json, os, warnings
warnings.filterwarnings("ignore")
sys.stdout.reconfigure(line_buffering=True)

def progress(m): print(m, file=sys.stderr, flush=True)
def result(d):   print(json.dumps(d), flush=True)


def merge_minor_speakers(diar, min_total_sec=5.0, min_fraction=0.04):
    """
    Catches pyannote's common 'phantom speaker' failure: clustering produces
    N+1 speakers but one of them is barely present (a handful of short turns
    totaling a few seconds — almost always a misclassified blip of an existing
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
    flanked by two runs of the SAME other speaker Y, is just noise — relabel
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


def main():
    if len(sys.argv) < 4:
        result({"error": "Uso: diarize.py <audio.wav> <hf_token> <whisper_json> [--num-speakers=N ...]"})
        sys.exit(1)

    audio_path, hf_token, whisper_json = sys.argv[1], sys.argv[2], sys.argv[3]
    kwargs = {}
    for arg in sys.argv[4:]:
        if not arg.startswith("--"): continue
        try:
            k, v = arg[2:].split("=", 1)
            kwargs[k.replace("-", "_")] = int(v)
        except Exception: pass

    if not os.path.exists(audio_path):
        result({"error": f"audio: {audio_path}"}); sys.exit(1)
    if not os.path.exists(whisper_json):
        result({"error": f"whisper json: {whisper_json}"}); sys.exit(1)

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

    try:
        progress("Carregando pyannote.audio...")
        from pyannote.audio import Pipeline
        import torch
    except ImportError as e:
        result({"error": f"pyannote.audio não instalado: {e}"}); sys.exit(1)

    try:
        pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=hf_token)
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

        diar = []
        if hasattr(diarization, "itertracks"):
            for turn, _, sp in diarization.itertracks(yield_label=True):
                diar.append({"start": turn.start, "end": turn.end, "speaker": sp})
        elif hasattr(diarization, "speaker_diarization"):
            for turn, _, sp in diarization.speaker_diarization.itertracks(yield_label=True):
                diar.append({"start": turn.start, "end": turn.end, "speaker": sp})

        if not diar:
            result({"error": "Não foi possível identificar vozes no áudio."}); sys.exit(1)

        # Phantom-speaker reduction must run BEFORE the blip smoother.
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
`

function run(cmd) { console.log(`▶ ${cmd}`); execSync(cmd, { stdio: 'inherit' }) }

function getPython() {
  for (const bin of ['python3', 'python']) {
    const r = spawnSync(bin, ['--version'])
    if (r.status === 0) return bin
  }
  return null
}

function main() {
  console.log('\n🔧 setup-diarization.js — pyannote.audio venv + model\n')

  const tokenArg = process.argv.find((a) => a.startsWith('--token='))
  const hfToken  = tokenArg && tokenArg.slice('--token='.length).trim()
  if (!hfToken) {
    console.error('❌ HF token ausente.')
    console.error('   Uso: npm run setup:diarization -- --token=hf_xxxxxxxx')
    process.exit(1)
  }
  // Catch the most common mistake: pasting an OpenAI/Anthropic-style key (sk_…)
  // or a personal API key from somewhere else. HuggingFace tokens always start
  // with `hf_`. Failing fast here saves a 2 GB torch download + venv build for
  // nothing.
  if (!hfToken.startsWith('hf_')) {
    console.error('❌ Token inválido — formato esperado: hf_xxxxxxxx (Hugging Face).')
    console.error(`   Você passou: ${hfToken.slice(0, 8)}…  (prefixo errado)`)
    console.error('')
    console.error('   Crie um token grátis em:  https://huggingface.co/settings/tokens')
    console.error('   E aceite as licenças em:')
    console.error('     https://huggingface.co/pyannote/segmentation-3.0')
    console.error('     https://huggingface.co/pyannote/speaker-diarization-3.1')
    console.error('     https://huggingface.co/pyannote/wespeaker-voxceleb-resnet34-LM')
    process.exit(1)
  }

  fs.mkdirSync(PY_DIR, { recursive: true })
  fs.writeFileSync(DIARIZE_PY, DIARIZE_SCRIPT)

  const sysPython = getPython()
  if (!sysPython) {
    console.error('❌ Python 3 não encontrado. macOS: brew install python@3.11')
    process.exit(1)
  }

  if (!fs.existsSync(VENV_PY)) {
    run(`${sysPython} -m venv "${VENV_DIR}"`)
  }

  run(`"${VENV_PIP}" install --upgrade pip --quiet`)
  console.log('\n📦 Instalando torch (CPU) + pyannote.audio (pode demorar)…\n')
  run(`"${VENV_PIP}" install --quiet torch torchaudio --index-url https://download.pytorch.org/whl/cpu`)
  run(`"${VENV_PIP}" install --quiet pyannote.audio`)

  console.log('\n📥 Baixando pesos do pyannote/speaker-diarization-3.1 (uma vez)…\n')
  const downloadScript = path.join(PY_DIR, '_download.py')
  fs.writeFileSync(downloadScript, [
    'from pyannote.audio import Pipeline',
    'import sys',
    'token = sys.argv[1]',
    'Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=token)',
    'print("OK")',
  ].join('\n'))
  try {
    run(`"${VENV_PY}" "${downloadScript}" "${hfToken}"`)
  } finally {
    try { fs.unlinkSync(downloadScript) } catch (_) {}
  }

  fs.writeFileSync(CONFIG, JSON.stringify({
    pythonBin: VENV_PY,
    hfToken,
    installedAt: new Date().toISOString(),
  }, null, 2))

  console.log('\n✅ Diarização pronta. Você pode rodar `npm run dev` agora.\n')
}

main()
