# Arquitetura

Como o Skkribe funciona por dentro. Pra quem quer estudar, modificar ou
contribuir com o código.

---

## Visão geral

```
skkribe/
├── src/main/                 # processo principal do Electron (Node.js)
│   ├── index.js              #   janela + IPC + pipeline de transcrição
│   ├── runtime-setup.js      #   auto-setup no primeiro uso (modelos, venv, token)
│   └── preload.js            #   ponte segura main ↔ renderer (window.skkribe)
├── src/renderer/             # interface (React + Vite + Tailwind)
│   └── src/
│       ├── App.jsx           #   máquina de estados + roteamento de telas
│       ├── lib/
│       │   ├── state.js      #   estado global (hook useAppState)
│       │   └── format.js     #   formatação de tempo/timestamps
│       ├── components/       #   PopIn, Buttons, StatusPill, icons…
│       └── views/            #   uma tela por estado (ver abaixo)
├── scripts/                  # scripts de setup (dev / CI)
│   ├── setup-whisper.js      #   compila o whisper.cpp + baixa VAD
│   ├── setup-python.js       #   baixa o CPython 3.11 portátil
│   ├── setup-diarization.js  #   (legado) monta o venv manualmente
│   └── download-model.js     #   (legado) baixa um modelo whisper
├── resources/
│   ├── whisper/              #   binário + modelos (parte bundled, parte runtime)
│   └── python/
│       └── diarize.py        #   script Python de diarização (bundled)
└── build/                    # ícones do app (svg/png/icns)
```

### Dois processos (regra do Electron)

- **Main** (Node.js), acesso total ao sistema: roda ffmpeg, whisper, Python,
  lê/escreve arquivos. É onde mora a pipeline pesada.
- **Renderer** (Chromium), só a UI. Não toca no sistema diretamente; pede tudo
  ao main via IPC.
- **Preload**, define exatamente o que o renderer pode chamar
  (`window.skkribe.transcribe(...)`, etc). Tudo o mais é inacessível,
  é a fronteira de segurança.

---

## A pipeline de transcrição

Tudo acontece em `src/main/index.js`, no handler `transcribe:file`.

### Passo 1: Normalizar o áudio (ffmpeg)

Qualquer formato → WAV 16 kHz mono. É o formato que tanto o whisper quanto o
pyannote esperam. Usa o binário do pacote `ffmpeg-static` (não depende do
ffmpeg do sistema).

### Passo 2: Cortar em blocos de ~60s, alinhados a silêncios

`ffmpeg silencedetect` mapeia as pausas do áudio; cada corte de ~60s desliza
(até ±20s) para o **meio do silêncio mais próximo**, então nenhuma palavra é
fatiada entre dois blocos — o corte fixo antigo garbleava/duplicava a palavra
da emenda e quebrava o contexto da frase. `ffmpeg segment -segment_times` faz
o corte, e cada bloco carrega seu offset real (os cortes não são uniformes).

> Usamos re-encode (`pcm_s16le`), não `-c copy`. PCM não tem keyframes, e
> `-c copy` produziria blocos truncados.

### Passo 3: Transcrever em paralelo (whisper.cpp) — junto com o Passo 4

A diarização **não espera a transcrição**: o `diarize.py` é disparado assim que
o WAV fica pronto (só precisa do áudio) e roda em paralelo com os blocos do
whisper. O tempo total vira ≈ max(whisper, pyannote) em vez da soma. O whisper
entrega seu JSON via escrita atômica (tmp + rename) e o `diarize.py`
(`--wait-json`) só bloqueia na fase final, a atribuição palavra→falante.

`transcribeChunksParallel` roda N processos do whisper simultaneamente. O número
de workers × threads é calculado por `balanceParallelism(cores)`, mira ~4
threads por worker (o ponto ótimo do whisper.cpp), com teto de 6 workers (2 no
Vulkan: cada worker sobe uma cópia do modelo pra VRAM).

O binário: Metal no macOS; no Windows/Linux o instalador traz **dois** builds
(`main` CPU portátil + `main-vulkan` GPU). O app sonda o Vulkan uma vez por
sessão (`pickWhisperBinary`) e cai pro CPU se não houver driver. Os builds
distribuídos usam `GGML_NATIVE=OFF` + AVX2 (um build `-march=native` do runner
do CI crasharia com "illegal instruction" em CPUs mais antigas).

O modelo depende do modo escolhido pelo usuário na tela de contagem de pessoas:
`fast` (large-v3-turbo q5_0), `balanced` (large-v3 q5_0, padrão) ou `max`
(large-v3 f16). Só o `balanced` vem do primeiro setup; os outros baixam sob
demanda na primeira vez.

Flags importantes do whisper:

| Flag | Por quê |
|---|---|
| `--output-json-full` | timestamps **por token** → permite atribuir falante palavra-a-palavra |
| `--vad --vad-model` | pula silêncios (Silero VAD) → evita alucinações tipo "[Música]" |
| `--suppress-nst` | descarta tokens não-fala |
| `-bs 5` | beam search explícito (não depende do default do CLI) |
| `-dtw <preset>` | timestamps por token via DTW nas atenções — bem mais precisos que a heurística |
| `-fa` | flash attention, só quando há GPU (Metal/Vulkan) |
| `-mc 64` | limita o contexto carregado entre segmentos → evita loops de repetição |

Os tokens são reagrupados em **palavras** (`groupTokensIntoWords`) com seus
tempos de início/fim.

> Sutileza de timeline: com VAD ligado, o whisper.cpp remapeia pro tempo
> original só os offsets de **segmento**; os de token (e o `t_dtw`) ficam na
> timeline filtrada. `groupTokensIntoWords` rescala linearmente os tokens de
> cada segmento pro span (já remapeado) do segmento — sem isso, cada palavra
> desliza pelo total de silêncio removido antes dela e cai no falante errado.

### Passo 4: Identificar os falantes (pyannote.audio)

`resources/python/diarize.py` roda no WAV **inteiro** (não nos blocos) com o
modelo `pyannote/speaker-diarization-community-1` (pyannote.audio 4.x, o
sucessor do 3.1: mesma segmentação, bem menos confusão/contagem errada de
falantes) e devolve "de tal a tal segundo, falou o speaker X". Usa MPS (GPU
Apple), CUDA, ou CPU, nessa ordem de preferência. Quando o pipeline expõe a
saída **exclusiva** (sem sobreposições), preferimos ela — encaixa melhor com a
atribuição por sobreposição de palavras.

Se o usuário disse quantas pessoas há, passamos `--num-speakers=N` (restrição
forte, hints suaves deixam o pyannote inventar falantes-fantasma).

### Passo 5: Casar palavras com falantes

Aqui está o "molho secreto", em `diarize.py`:

1. **`merge_minor_speakers`**, remove falantes-fantasma (clusters com <5s ou
   <4% do total são reatribuídos ao vizinho real mais próximo).
2. **`smooth_diar`**, funde "blips" de <500ms encravados entre dois turnos do
   mesmo falante (re-segmentação por restrição).
3. **`assign_speakers_word_level`**, pra cada palavra, escolhe o falante com
   **maior sobreposição temporal** (algoritmo do WhisperX).
4. **`smooth_word_speakers`**, histerese: uma sequência curta (<3 palavras) de
   um falante, cercada pelo mesmo outro falante dos dois lados, é considerada
   ruído e reescrita.

Resultado: palavras consecutivas do mesmo falante viram um segmento, e os
falantes são renomeados pra "Pessoa 1, 2, 3…" na ordem em que aparecem.

---

## O setup do primeiro uso

`src/main/runtime-setup.js` mantém o instalador pequeno: só o essencial vai
embutido, o resto baixa no primeiro launch.

### Caminhos: bundled vs. gravável

| Tipo | Onde (produção) | O quê |
|---|---|---|
| **Bundled** (read-only) | dentro do `.app`/`.exe`/`.AppImage` | binário whisper, VAD, `diarize.py`, CPython 3.11 portátil (todas as plataformas) |
| **Gravável** | `app.getPath('userData')` | modelo large-v3, venv Python, cache pyannote, token HF |

> Em **dev**, os dois caminhos colapsam pra `resources/` no repositório, então
> os scripts manuais e o auto-setup compartilham os mesmos arquivos.

### As 3 fases (idempotentes)

`runSetup` só roda o que falta, se o app crashar no meio, retoma de onde parou:

1. **model**, baixa `ggml-large-v3-q5_0.bin` (~1 GB) da HuggingFace (os modos
   `fast`/`max` baixam seus modelos sob demanda, fora do setup)
2. **venv**, cria o venv a partir do **Python 3.11 portátil bundlado** (não do
   Python do sistema), instala `torch` + `pyannote.audio>=4`
3. **weights**, baixa os pesos do pyannote community-1 (~100 MB) usando o token
   do usuário (repo gated: exige o "Agree" no site da HF)

Um marcador de versão (`VENV_SCHEMA`) detecta venvs antigos/incompatíveis e os
reconstrói automaticamente em vez de mostrar um erro Python críptico.

### Token HuggingFace

O app é open source, então **não** embutimos um token compartilhado. Cada
usuário cola o seu na primeira execução (`TokenGate` em `FirstRunSetup.jsx`), e
ele fica salvo em `userData/python/.hf-token`, só na máquina dele.

---

## A interface (renderer)

Máquina de estados simples em `lib/state.js`:

```
loading → firstRun? → idle → choosingSpeakers → working → done
                                                    ↓
                                                  error
```

Cada estado renderiza uma view (`App.jsx` faz o switch). O design system
(cores, pills, animações popIn) está em `tailwind.config.js` + `components/`.

---

## Por que estas escolhas?

| Decisão | Motivo |
|---|---|
| whisper.cpp em vez de Python | binário nativo, sem dependência de Python pesado pra transcrever; Metal no Mac |
| pyannote em Python (não nativo) | é o estado-da-arte em diarização; não há equivalente C++ maduro |
| Modos de modelo (`fast`/`balanced`/`max`) | um seletor de 3 opções na tela de contagem; default `large-v3`, turbo pra quem quer velocidade, f16 pra qualidade máxima |
| Modelos baixados em runtime | instalador de ~180 MB em vez de ~3 GB; cabe nos canais de distribuição |
| Python 3.11 portátil bundlado | venv determinístico nas 3 plataformas; imune ao Python do sistema ser 3.13/3.14 ou inexistente |
| `torch<2.6` / `huggingface_hub<0.24` | pins necessários por breaking changes upstream, ver comentários no código |
