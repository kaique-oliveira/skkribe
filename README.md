<div align="center">

<img src="build/icon.svg" width="96" height="96" alt="Skkribe logo" />

# Skkribe

**Transcrição de áudio + identificação de quem falou, 100% no seu computador.**

Sem nuvem, sem conta paga, sem enviar seu áudio pra lugar nenhum.
Roda em macOS, Windows e Linux.

[![Baixar](https://img.shields.io/github/v/release/kaique-oliveira/skkribe?label=baixar&color=DC2626)](https://github.com/kaique-oliveira/skkribe/releases/latest)
[![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)](LICENSE)
![macOS · Windows · Linux](https://img.shields.io/badge/macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-offline-success)

[Baixar instalador](#-baixar-e-usar) · [O que ele faz](#-o-que-ele-faz) ·
[Como funciona](#-como-funciona) · [Rodar do código](#-rodar-do-código-fonte) ·
[Gerar build](docs/BUILD.md) · [Contribuir](docs/CONTRIBUTING.md)

</div>

---

## O que é

Você joga um áudio (reunião, entrevista, podcast, áudio do WhatsApp) e o Skkribe
devolve a transcrição **separada por pessoa**:

```
Pessoa 1   00:00
Bom dia, vamos começar a reunião de hoje.

Pessoa 2   00:04
Perfeito. Eu preparei os números do trimestre.
```

**Tudo processado localmente** usando dois projetos open source de ponta:

- [**whisper.cpp**](https://github.com/ggml-org/whisper.cpp): transcrição
  (modelos `large-v3` / `large-v3-turbo` da OpenAI). Usa a GPU quando existe:
  Metal no macOS, Vulkan no Windows e Linux.
- [**pyannote.audio**](https://github.com/pyannote/pyannote-audio): identificação
  de falantes (modelo `community-1`, o mais recente).

---

## ✨ O que ele faz

**Entende quase qualquer arquivo**
MP3, M4A, WAV, OGG, FLAC, AAC, OPUS · MP4, MOV, M4V, MKV, WEBM, AVI (extrai o
áudio do vídeo automaticamente).

**Separa quem falou**
Cada trecho vai para a pessoa certa, com marcação de tempo. Se você souber
quantas pessoas falam, informa — vira uma restrição que melhora bastante o
resultado. Se não souber, a detecção é automática.

**Você escolhe velocidade ou precisão**

| Modo | Modelo | Tamanho | Quando usar |
|---|---|---|---|
| ⚡ **Rápido** | `large-v3-turbo` | ~574 MB | Áudio limpo. Bem mais rápido, com perda mínima |
| ⚖️ **Padrão** | `large-v3` | ~1,1 GB | O equilíbrio (default) |
| 💎 **Máximo** | `large-v3` f16 | ~3,1 GB | Precisão total, para áudio difícil |

O modelo é baixado só quando você escolhe aquele modo pela primeira vez.

**Trabalha em cima do resultado**
- Renomear os participantes ("Pessoa 1" → "Dra. Helena") em toda a transcrição
- Copiar tudo, com nomes e timestamps
- Copiar a fala de **uma pessoa só**, para isolar o que ela disse na reunião
inteira
- Exportar em **Markdown**, com cabeçalho de metadados e seções por falante

**Rápido de verdade**
Transcrição e identificação de vozes rodam **ao mesmo tempo**, não em sequência —
o tempo total é o do mais lento dos dois, não a soma. Os blocos de áudio são
transcritos em paralelo, aproveitando todos os núcleos da máquina.

---

## 📥 Baixar e usar

> Para quem só quer **usar** o app, sem mexer em código.

1. Baixe o instalador da sua plataforma na página de
   [**Releases**](https://github.com/kaique-oliveira/skkribe/releases/latest):
   - **macOS** (Apple Silicon) → `.dmg`
   - **Windows** (x64) → `.exe`
   - **Linux** (x64) → `.AppImage`
2. Instale e abra normalmente.
3. Na primeira vez, o app pede um **token gratuito da HuggingFace** (≈2 min, o
   guia aparece na tela) e baixa os modelos automaticamente (~2,7 GB, uma vez só).
4. Pronto. Da próxima vez abre direto.

👉 Passo a passo detalhado da primeira execução em
[**docs/GETTING_STARTED.md**](docs/GETTING_STARTED.md).

---

## 🚀 Como funciona

```
  seu áudio (mp3, m4a, wav, mp4, …)
        │
        ▼
   ┌──────────┐   converte pra WAV 16 kHz mono e corta em
   │  ffmpeg  │   blocos de ~60 s SEMPRE numa pausa da fala
   └──────────┘   (nunca no meio de uma palavra)
        │
        ├──────────────────────────────┐
        ▼                              ▼
   ┌────────────────┐   AO MESMO   ┌──────────────────┐
   │  whisper.cpp   │   TEMPO...   │  pyannote.audio  │
   │  blocos em     │              │  descobre quem   │
   │  PARALELO +VAD │              │  fala (áudio     │
   └────────────────┘              │  inteiro)        │
        │  texto + tempos          └──────────────────┘
        └──────────────┬───────────────┘
                       │
                       ▼
   junta palavra-a-palavra ao falante certo (overlap + suavização)
                       │
                       ▼
   transcrição final separada por "Pessoa 1, 2, 3…"
```

**Quer o detalhe técnico?** Dois documentos cobrem tudo:

- 📖 [**SOBRE_O_PROJETO.md**](docs/SOBRE_O_PROJETO.md) — visão geral: o problema,
  a arquitetura, as decisões de engenharia e a stack completa.
- 🔬 [**COMO_FUNCIONA.md**](docs/COMO_FUNCIONA.md) — o *deep dive*: como a
  transcrição fica boa, como fica rápida e como a diarização fica precisa. Cada
  decisão com o problema que ela resolve.

---

## 🧑‍💻 Rodar do código-fonte

> Para quem quer **estudar** ou **modificar** o app.

### Pré-requisitos

| Ferramenta | Versão | Pra quê |
|---|---|---|
| [Node.js](https://nodejs.org) | 20+ | rodar o Electron + Vite |
| [pnpm](https://pnpm.io/installation) | 9+ | gerenciador de pacotes |
| [CMake](https://cmake.org) + compilador C++ | qualquer | compilar o whisper.cpp |
| [Git](https://git-scm.com) | qualquer | clonar o whisper.cpp |

> Você **não** precisa instalar Python. O Skkribe baixa um Python 3.11 portátil
> próprio (`setup:python`), igual em todas as plataformas. Os detalhes de
> instalação dos pré-requisitos (por SO) estão nos guias de build abaixo.

### Passos

```bash
# 1. clonar
git clone https://github.com/kaique-oliveira/skkribe.git
cd skkribe

# 2. instalar dependências (raiz + renderer)
pnpm install
pnpm install --dir src/renderer

# 3. preparar os motores nativos (uma vez, ~5 min)
pnpm run setup:whisper     # compila o whisper.cpp + baixa o VAD
pnpm run setup:python      # baixa o Python 3.11 portátil

# 4. rodar em modo desenvolvimento (hot reload)
pnpm run dev
```

Na primeira execução o app pede seu token HuggingFace e baixa os modelos
automaticamente, igual ao app instalado.

> **Build com GPU (Windows/Linux):** `SKKRIBE_VULKAN=1 pnpm run setup:whisper`
> compila também o binário Vulkan (requer o Vulkan SDK). O app detecta e usa
> automaticamente, caindo para CPU quando não há driver.

---

## 📦 Gerar o executável

Cada sistema operacional precisa ser empacotado no próprio sistema (o
whisper.cpp é compilado nativamente, não dá pra cross-compilar).

| Plataforma | Guia | Comando |
|---|---|---|
| 🍎 macOS | [docs/build-macos.md](docs/build-macos.md) | `pnpm run build:mac` |
| 🪟 Windows | [docs/build-windows.md](docs/build-windows.md) | `pnpm run build:win` |
| 🐧 Linux | [docs/build-linux.md](docs/build-linux.md) | `pnpm run build:linux` |

Ou empurre uma tag `skkribe-v*` e o GitHub Actions compila as três plataformas
em paralelo e publica o Release sozinho. Visão geral em
[**docs/BUILD.md**](docs/BUILD.md).

---

## 📚 Documentação

| Doc | Pra quem |
|---|---|
| [GETTING_STARTED.md](docs/GETTING_STARTED.md) | Usuário final: primeira execução, token HF |
| [SOBRE_O_PROJETO.md](docs/SOBRE_O_PROJETO.md) | Visão geral técnica: problema, arquitetura, decisões |
| [COMO_FUNCIONA.md](docs/COMO_FUNCIONA.md) | Deep dive: qualidade, velocidade e diarização |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Quem quer entender o código por dentro |
| [BUILD.md](docs/BUILD.md) | Visão geral de como gerar os instaladores |
| [build-macos.md](docs/build-macos.md) · [build-windows.md](docs/build-windows.md) · [build-linux.md](docs/build-linux.md) | Guia passo a passo por plataforma |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Resolver erros comuns |
| [CHANGELOG.md](CHANGELOG.md) | O que mudou em cada versão |
| [CONTRIBUTING.md](docs/CONTRIBUTING.md) | Como contribuir |

---

## 🔒 Privacidade

O áudio **nunca sai do seu computador**. A única conexão de rede que o Skkribe
faz é na **primeira execução**, pra baixar os modelos da HuggingFace. Depois
disso ele funciona 100% offline.

O token da HuggingFace fica salvo apenas na sua máquina e só é usado para baixar
os modelos.

---

## 📄 Licença

[MIT](LICENSE): use, estude, modifique e distribua à vontade.

Construído sobre projetos open source incríveis:
[whisper.cpp](https://github.com/ggml-org/whisper.cpp),
[pyannote.audio](https://github.com/pyannote/pyannote-audio),
[Electron](https://electronjs.org),
[React](https://react.dev) e
[ffmpeg](https://ffmpeg.org).
