# Build no Linux 🐧

Gera o `Skkribe-1.0.0.AppImage` para x64. O AppImage é um único arquivo
executável que roda em praticamente qualquer distro, sem instalação.

> Os comandos abaixo usam `apt` (Ubuntu/Debian). Em Fedora/Arch troque o
> gerenciador de pacotes — as ferramentas têm os mesmos nomes.

---

## 1. Pré-requisitos

### Para iniciantes (Ubuntu/Debian)

```bash
# compilador C++, cmake e git
sudo apt update
sudo apt install -y build-essential cmake git

# Python + módulo venv (o app usa pra rodar o pyannote)
sudo apt install -y python3 python3-venv

# FUSE — necessário pra RODAR AppImages (e pro próprio app gerado abrir)
sudo apt install -y libfuse2
```

Node 20 + pnpm (via [nvm](https://github.com/nvm-sh/nvm), recomendado):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# feche e reabra o terminal, então:
nvm install 20
npm install -g pnpm
```

### Para quem já tem ambiente

Precisa de: `gcc/g++`, `cmake`, `git`, `node` (20+), `pnpm` (9+),
`python3` **com `python3-venv`**, e `libfuse2`. Confira:

```bash
cmake --version && node --version && pnpm --version && python3 -m venv --help >/dev/null && echo "venv ok"
```

> ⚠️ O erro mais comum no Linux é ter `python3` mas **não** ter o pacote
> `python3-venv`. O app detecta isso e avisa, mas pra build local instale
> antes: `sudo apt install python3-venv`.

---

## 2. Clonar e instalar

```bash
git clone https://github.com/kaique-oliveira/skkribe.git
cd skkribe

pnpm install
pnpm install --dir src/renderer
```

---

## 3. Compilar o whisper.cpp

```bash
pnpm run setup:whisper
```

Compila com GCC (modo CPU) e baixa o modelo VAD. ~3-5 min.
O binário vai pra `resources/whisper/main`.

---

## 4. Empacotar

```bash
pnpm run build:linux
```

Resultado em `dist/`:

- `Skkribe-1.0.0.AppImage` — distribua este

Pra testar localmente:

```bash
chmod +x dist/Skkribe-1.0.0.AppImage
./dist/Skkribe-1.0.0.AppImage
```

---

## Notas

- **Python NÃO vai dentro do AppImage** (diferente do Windows). No Linux o app
  usa o `python3` do sistema do usuário — por isso o usuário final também
  precisa de `python3` + `python3-venv` instalados. Isso está documentado no
  [GETTING_STARTED.md](GETTING_STARTED.md).
- **ffmpeg** vem embutido (`ffmpeg-static`).
- **Wayland:** se a janela não abrir corretamente em algumas distros com
  Wayland, rode com `--ozone-platform=x11` ou exporte
  `ELECTRON_OZONE_PLATFORM_HINT=auto`.

---

## Deu erro?

| Erro | Solução |
|---|---|
| `cmake não encontrado` | `sudo apt install cmake build-essential` |
| `ensurepip is not available` | falta o venv: `sudo apt install python3-venv` |
| AppImage não abre / erro de FUSE | `sudo apt install libfuse2` |
| `python3 não encontrado` (no app) | `sudo apt install python3 python3-venv` |

Mais em [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
