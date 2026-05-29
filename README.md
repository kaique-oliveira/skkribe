<div align="center">

<img src="build/icon.svg" width="96" height="96" alt="Skkribe logo" />

# Skkribe

**Transcrição de áudio + identificação de quem falou, 100% no seu computador.**

Sem nuvem, sem conta paga, sem enviar seu áudio pra lugar nenhum.
Roda em macOS, Windows e Linux.

[Baixar instalador](#-baixar-e-usar) · [Como funciona](#-como-funciona) ·
[Rodar do código](#-rodar-do-código-fonte) · [Gerar build](docs/BUILD.md) ·
[Contribuir](docs/CONTRIBUTING.md)

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

Dá pra renomear as pessoas, copiar a fala de cada uma, e exportar tudo em Markdown.

**Tudo processado localmente** usando dois projetos open source de ponta:

- [**whisper.cpp**](https://github.com/ggml-org/whisper.cpp): transcrição (modelo `large-v3` da OpenAI, o melhor pra nomes próprios e palavras raras)
- [**pyannote.audio**](https://github.com/pyannote/pyannote-audio): identificação de falantes (diarização)

---

## 📥 Baixar e usar

> Para quem só quer **usar** o app, sem mexer em código.

1. Baixe o instalador da sua plataforma na página de
   [**Releases**](https://github.com/kaique-oliveira/skkribe/releases):
   - **macOS** → `.dmg`
   - **Windows** → `.exe`
   - **Linux** → `.AppImage`
2. Instale e abra normalmente.
3. Na primeira vez, o app pede um **token gratuito da HuggingFace** (≈2 min, o
   guia aparece na tela) e baixa os modelos automaticamente (~2,7 GB, uma vez só).
4. Pronto. Da próxima vez abre direto.

👉 Passo a passo detalhado da primeira execução em
[**docs/GETTING_STARTED.md**](docs/GETTING_STARTED.md).

---

## ✨ Como funciona

```
  seu áudio (mp3, m4a, wav, mp4, …)
        │
        ▼
   ┌──────────┐   converte pra WAV 16 kHz mono
   │  ffmpeg  │   e corta em blocos de 60 s
   └──────────┘
        │
        ▼
   ┌────────────────┐   transcreve os blocos EM PARALELO
   │  whisper.cpp   │   (pula silêncios com VAD pra não inventar texto)
   └────────────────┘
        │                      ┌──────────────────┐   descobre quem fala
        │  texto + tempos      │  pyannote.audio  │   em cada trecho
        └──────────────────────┤  (no áudio todo) │
                               └──────────────────┘
        │
        ▼
   junta palavra-a-palavra ao falante certo (overlap + suavização)
        │
        ▼
   transcrição final separada por "Pessoa 1, 2, 3…"
```

Quer o detalhe técnico de cada etapa, os algoritmos de atribuição e as decisões
de design? Está tudo em [**docs/ARCHITECTURE.md**](docs/ARCHITECTURE.md).

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

> Você **não** precisa instalar Python, o Skkribe baixa um Python 3.11 portátil
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

---

## 📦 Gerar o executável

Cada sistema operacional precisa ser empacotado no próprio sistema (o
whisper.cpp é compilado nativamente, não dá pra cross-compilar).

| Plataforma | Guia | Comando |
|---|---|---|
| 🍎 macOS | [docs/build-macos.md](docs/build-macos.md) | `pnpm run build:mac` |
| 🪟 Windows | [docs/build-windows.md](docs/build-windows.md) | `pnpm run build:win` |
| 🐧 Linux | [docs/build-linux.md](docs/build-linux.md) | `pnpm run build:linux` |

Visão geral e a opção de build automático via GitHub Actions:
[**docs/BUILD.md**](docs/BUILD.md).

---

## 📚 Documentação

| Doc | Pra quem |
|---|---|
| [GETTING_STARTED.md](docs/GETTING_STARTED.md) | Usuário final: primeira execução, token HF |
| [BUILD.md](docs/BUILD.md) | Visão geral de como gerar os instaladores |
| [build-macos.md](docs/build-macos.md) · [build-windows.md](docs/build-windows.md) · [build-linux.md](docs/build-linux.md) | Guia passo a passo por plataforma |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Quem quer entender o código por dentro |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Resolver erros comuns |
| [CONTRIBUTING.md](docs/CONTRIBUTING.md) | Como contribuir |

---

## 🔒 Privacidade

O áudio **nunca sai do seu computador**. A única conexão de rede que o Skkribe
faz é na **primeira execução**, pra baixar os modelos da HuggingFace. Depois
disso ele funciona 100% offline.

---

## 📄 Licença

[MIT](LICENSE): use, estude, modifique e distribua à vontade.

Construído sobre projetos open source incríveis:
[whisper.cpp](https://github.com/ggml-org/whisper.cpp),
[pyannote.audio](https://github.com/pyannote/pyannote-audio),
[Electron](https://electronjs.org),
[React](https://react.dev) e
[ffmpeg](https://ffmpeg.org).
