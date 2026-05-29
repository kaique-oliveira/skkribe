# Build no Linux 🐧

Gera o `Skkribe-1.0.0.AppImage` para x64. O AppImage é um único arquivo
executável que roda em praticamente qualquer distro, sem instalação.

> Os comandos abaixo usam `apt` (Ubuntu/Debian). Em Fedora/Arch troque o
> gerenciador de pacotes, as ferramentas têm os mesmos nomes.

---

## 1. Pré-requisitos

### Para iniciantes (Ubuntu/Debian)

```bash
# compilador C++, cmake e git
sudo apt update
sudo apt install -y build-essential cmake git

# FUSE: necessário pra RODAR AppImages (e pro próprio app gerado abrir)
sudo apt install -y libfuse2
```

> Você **não** precisa instalar Python, o Skkribe baixa e empacota um Python
> 3.11 portátil próprio (passo 3 abaixo). Isso vale também pro usuário final:
> o AppImage roda sem Python no sistema.

Node 20 + pnpm (via [nvm](https://github.com/nvm-sh/nvm), recomendado):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# feche e reabra o terminal, então:
nvm install 20
npm install -g pnpm
```

### Para quem já tem ambiente

Precisa de: `gcc/g++`, `cmake`, `git`, `node` (20+), `pnpm` (9+) e `libfuse2`.
Confira:

```bash
cmake --version && node --version && pnpm --version && echo ok
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
pnpm run setup:whisper     # compila o whisper.cpp (GCC) + baixa o VAD
pnpm run setup:python      # baixa o Python 3.11 portátil (~30 MB)
```

O whisper vai pra `resources/whisper/main` e o Python pra
`resources/python/runtime/`. ~3-5 min no total.

---

## 4. Empacotar

```bash
pnpm run build:linux
```

Resultado em `dist/`:

- `Skkribe-1.0.0.AppImage`: distribua este

Pra testar localmente:

```bash
chmod +x dist/Skkribe-1.0.0.AppImage
./dist/Skkribe-1.0.0.AppImage
```

---

## Notas

- **Python vai embutido no AppImage** (CPython 3.11 portátil), igual nas outras
  plataformas, o usuário final **não** precisa de Python instalado.
- **ffmpeg** vem embutido (`ffmpeg-static`).
- **Wayland:** se a janela não abrir corretamente em algumas distros com
  Wayland, rode com `--ozone-platform=x11` ou exporte
  `ELECTRON_OZONE_PLATFORM_HINT=auto`.

---

## Deu erro?

| Erro | Solução |
|---|---|
| `cmake não encontrado` | `sudo apt install cmake build-essential` |
| AppImage não abre / erro de FUSE | `sudo apt install libfuse2` |
| `setup:python` falhou | confira a conexão; o script baixa ~30 MB do GitHub |

Mais em [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
