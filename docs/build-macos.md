# Build no macOS 🍎

Gera o `Skkribe.dmg` (instalador) e `Skkribe.zip` para Apple Silicon (M1, M2,
M3, M4, M5…).

> **Por que só Apple Silicon?** O build ativa o Metal (GPU da Apple) pra deixar
> a transcrição rápida. Macs Intel ainda rodariam, mas não são o alvo. Pra
> incluir Intel, edite o `arch` em `package.json` → `build.mac.target`.

---

## 1. Pré-requisitos

### Para iniciantes (passo a passo)

Abra o **Terminal** (Cmd+Espaço → digite "Terminal") e cole cada bloco:

```bash
# Ferramentas de linha de comando da Apple (dá o compilador C++ e o git)
xcode-select --install
```

```bash
# Homebrew — gerenciador de programas do Mac (se ainda não tiver)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

```bash
# CMake (compila o whisper.cpp), Node e pnpm
brew install cmake node pnpm
```

> Você **não** precisa instalar Python — o Skkribe baixa e empacota um Python
> 3.11 portátil próprio (passo 3 abaixo).

### Para quem já tem ambiente

Você precisa de: `cmake`, `node` (20+), `pnpm` (9+), `git`, e Xcode Command Line
Tools. Confira:

```bash
cmake --version && node --version && pnpm --version && git --version
```

---

## 2. Clonar e instalar

```bash
git clone https://github.com/kaique-oliveira/skkribe.git
cd skkribe

pnpm install
pnpm install --dir src/renderer
```

---

## 3. Preparar os motores nativos

```bash
pnpm run setup:whisper     # compila o whisper.cpp (Metal) + baixa o VAD
pnpm run setup:python      # baixa o Python 3.11 portátil (~30 MB)
```

O whisper vai pra `resources/whisper/main` e o Python pra
`resources/python/runtime/`. Leva ~3-5 min no total.

---

## 4. Empacotar

```bash
pnpm run build:mac
```

Quando terminar, os arquivos estão em `dist/`:

- `Skkribe-1.0.0-arm64.dmg` — instalador (distribua este)
- `Skkribe-1.0.0-arm64-mac.zip` — versão portátil

---

## Notas

- **App não assinado:** o build não tem certificado de desenvolvedor Apple, então
  ao abrir pela primeira vez o usuário precisa de **botão direito → Abrir**. Pra
  distribuir sem esse aviso, você precisaria de uma conta Apple Developer (US$99/ano)
  e configurar `notarize` — fora do escopo deste projeto.
- **ffmpeg** vem embutido (pacote `ffmpeg-static`), não precisa instalar.
- O `dist/` é regenerável e está no `.gitignore` — não comite.

---

## Deu erro?

| Erro | Solução |
|---|---|
| `cmake não encontrado` | `brew install cmake` |
| `xcrun: error: invalid active developer path` | `xcode-select --install` |
| Build trava na compilação | feche apps pesados; a compilação usa todos os cores |

Mais em [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
