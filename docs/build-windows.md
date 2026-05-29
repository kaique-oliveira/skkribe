# Build no Windows 🪟

Gera o instalador `Skkribe Setup 1.0.0.exe` (NSIS) para Windows x64.

---

## 1. Pré-requisitos

### Para iniciantes (passo a passo)

Abra o **PowerShell** e instale tudo via [winget](https://learn.microsoft.com/windows/package-manager/winget/)
(já vem no Windows 10/11):

```powershell
# Node.js 20
winget install OpenJS.NodeJS.LTS

# Git
winget install Git.Git

# Ferramentas de compilação C++ (MSVC + CMake) — necessário pro whisper.cpp
winget install Microsoft.VisualStudio.2022.BuildTools

# Python 3.11 (pra rodar em modo dev; o app empacotado traz o seu próprio)
winget install Python.Python.3.11
```

> Ao instalar o **Visual Studio Build Tools**, na tela de componentes marque
> **"Desenvolvimento para desktop com C++"** (Desktop development with C++).
> Isso inclui o compilador MSVC e o CMake que o whisper.cpp precisa.

Depois instale o **pnpm** (com o Node já instalado):

```powershell
npm install -g pnpm
```

**Feche e reabra o PowerShell** pra carregar os novos PATHs.

### Para quem já tem ambiente

Você precisa de: MSVC + CMake (via VS Build Tools 2022), `node` (20+),
`pnpm` (9+), `git`, e Python 3 no PATH (só pra modo dev). Confira:

```powershell
cmake --version; node --version; pnpm --version; git --version; python --version
```

---

## 2. Clonar e instalar

```powershell
git clone https://github.com/kaique-oliveira/skkribe.git
cd skkribe

pnpm install
pnpm install --dir src/renderer
```

---

## 3. Compilar o whisper.cpp

```powershell
pnpm run setup:whisper
```

Isso compila com o MSVC (modo CPU/AVX2) e baixa o modelo VAD. ~3-5 min.
O binário vai pra `resources\whisper\main.exe`.

> Se der erro de `cmake não encontrado`, abra o **"Developer PowerShell for VS 2022"**
> (vem com o Build Tools) em vez do PowerShell comum — ele já tem o ambiente
> MSVC carregado.

---

## 4. Baixar o Python portátil (vai dentro do instalador)

O app empacotado não depende do Python do usuário — ele traz um Python próprio.
Baixe-o pra dentro de `resources`:

```powershell
mkdir resources\python\runtime -Force
curl -L -o python.tar.gz https://github.com/indygreg/python-build-standalone/releases/download/20240814/cpython-3.11.10+20240814-x86_64-pc-windows-msvc-shared-install_only.tar.gz
tar -xzf python.tar.gz -C resources\python\runtime --strip-components=1
del python.tar.gz
```

> Isso é o mesmo que o GitHub Actions faz automaticamente. Confira que o arquivo
> `resources\python\runtime\python.exe` existe.

---

## 5. Empacotar

```powershell
pnpm run build:win
```

Resultado em `dist\`:

- `Skkribe Setup 1.0.0.exe` — instalador (distribua este)

---

## Notas

- **App não assinado:** o Windows SmartScreen vai mostrar "aplicativo não
  reconhecido". O usuário clica em **"Mais informações" → "Executar assim mesmo"**.
  Pra remover o aviso seria necessário um certificado de code signing (pago).
- O ícone `.ico` é gerado automaticamente pelo electron-builder a partir do PNG.
- **ffmpeg** vem embutido (`ffmpeg-static`).

---

## Deu erro?

| Erro | Solução |
|---|---|
| `cmake não encontrado` | use o "Developer PowerShell for VS 2022", ou reinstale o Build Tools marcando "Desktop development with C++" |
| `whisper-cli.exe não encontrado` | a compilação falhou antes — role o log do `setup:whisper` pra ver o erro real |
| `python.exe` não existe em runtime | refaça o passo 4 (download do Python portátil) |

Mais em [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
