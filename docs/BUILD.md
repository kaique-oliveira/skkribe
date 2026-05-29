# Gerar os builds (instaladores)

Esta página explica **como** o build funciona e te direciona pro guia da sua
plataforma. Se você só quer o comando, pula pra tabela no fim.

---

## Entendendo o que acontece

O Skkribe é um app Electron, mas ele depende de dois "motores" nativos que
**não são JavaScript**:

1. **whisper.cpp**: um binário em C++ que precisa ser **compilado** pra cada
   sistema operacional e arquitetura. Não dá pra pegar o binário do Mac e rodar
   no Windows.
2. **pyannote.audio**: roda em Python. O ambiente Python é grande (~1,5 GB com
   o PyTorch), então **não vai dentro do instalador**, o app baixa e monta na
   primeira execução.

Por isso a regra de ouro:

> **Cada sistema operacional precisa ser empacotado no próprio sistema.**
> Você não consegue gerar um `.exe` do Windows estando no Mac (o whisper.cpp
> seria compilado pra Mac).

### O que VAI dentro do instalador (~180 a 230 MB)

| Item | De onde vem |
|---|---|
| App Electron (UI) | compilado pelo Vite |
| Binário `whisper.cpp` | compilado por `pnpm run setup:whisper` |
| Modelo VAD (detector de voz, ~864 KB) | baixado por `setup:whisper` |
| Script `diarize.py` | já está no repositório |
| Runtime Python 3.11 portátil (~30 MB) | baixado por `pnpm run setup:python` (todas as plataformas) |

> **Por que bundlar o Python?** O pyannote.audio + torch são sensíveis à versão
> do Python (precisamos de `torch<2.6`, que só tem wheels até o 3.12). Em vez de
> depender do Python do sistema do usuário, que pode ser 3.13/3.14 ou nem
> existir, embarcamos um CPython 3.11 portátil idêntico nos três sistemas.

### O que o app baixa SOZINHO na primeira execução (~2,7 GB)

- Modelo de transcrição `large-v3` (~1 GB)
- Ambiente Python com PyTorch + pyannote.audio (~1,5 GB)
- Pesos de identificação de vozes (~100 MB)

Isso mantém o instalador pequeno e funciona igual nas três plataformas.

---

## Opção A: Build local (na sua máquina)

Escolha o guia da sua plataforma:

| Plataforma | Guia | Resultado |
|---|---|---|
| 🍎 **macOS** | [build-macos.md](build-macos.md) | `.dmg` + `.zip` (Apple Silicon) |
| 🪟 **Windows** | [build-windows.md](build-windows.md) | instalador `.exe` (x64) |
| 🐧 **Linux** | [build-linux.md](build-linux.md) | `.AppImage` (x64) |

Os arquivos saem na pasta `dist/`.

---

## Opção B: Build automático (GitHub Actions)

O repositório tem um workflow em
[`.github/workflows/build-electron.yml`](../.github/workflows/build-electron.yml)
que compila nas três plataformas em paralelo, em servidores do GitHub, você não
precisa ter Windows/Linux fisicamente.

**Como disparar:**

- **Manualmente:** aba **Actions** → "Build Electron (Skkribe)" → "Run workflow"
- **Por tag:** `git tag skkribe-v1.0.0 && git push origin skkribe-v1.0.0`

Os instaladores ficam disponíveis como **artifacts** da execução (14 dias).

> **Nota:** o workflow vem configurado pra buildar **só Windows** por padrão
> (pra economizar minutos de CI). Pra ligar Mac e Linux, descomente as linhas
> no `matrix` do arquivo do workflow, está comentado e explicado lá.

> **Atenção a custos:** builds de macOS no GitHub Actions consomem **10x** mais
> minutos da cota grátis que Linux. Se sua conta estourar a cota, os jobs nem
> iniciam (erro de "spending limit"). Repositórios **públicos** têm Actions
> gratuito e ilimitado.

---

## Resumo dos comandos

```bash
# pré-requisito comum (uma vez)
pnpm install
pnpm install --dir src/renderer
pnpm run setup:whisper        # compila o whisper.cpp + baixa o VAD
pnpm run setup:python         # baixa o Python 3.11 portátil

# empacotar (rode no SO correspondente)
pnpm run build:mac            # → dist/*.dmg, dist/*.zip
pnpm run build:win            # → dist/*.exe
pnpm run build:linux          # → dist/*.AppImage
```
