# Solução de problemas

Erros comuns e como resolver, separados por contexto.

---

## No app (uso normal)

### "Token inválido — deve começar com hf_"

Você colou algo que não é um token HuggingFace. Tokens da HF sempre começam com
`hf_`. **Não use** chaves de outros serviços (OpenAI `sk_...`, pyannote.ai, etc).
Gere o certo em [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
(tipo **Read**).

### "Could not download pyannote..." / erro 401 ou 403 nos pesos

Seu token é válido mas você **não aceitou as licenças** dos modelos. Acesse e
clique em "Agree and access repository" em:

- https://huggingface.co/pyannote/segmentation-3.0
- https://huggingface.co/pyannote/speaker-diarization-3.1

Depois reabra o app.

### Download dos modelos interrompido / "Download incompleto"

Conexão caiu no meio. O app guarda o progresso e retoma — só **reabrir** e ele
continua de onde parou.

### A transcrição achou pessoas demais / de menos

Na tela "Quantas pessoas falam?", escolha o **número exato** em vez de "Não sei".
Isso força o pyannote e melhora muito o resultado. Para áudio de uma pessoa só,
escolha "1 pessoa" (pula a diarização inteira).

### Transcrição muito lenta no Windows/Linux

Esperado. Sem GPU Apple, o pyannote roda na CPU (~1x a 2x a duração do áudio).
No Mac (Apple Silicon) é bem mais rápido porque usa o Metal. Se você tem GPU
NVIDIA, dá pra acelerar reinstalando o PyTorch com CUDA dentro do venv
(`userData/python/venv`) — avançado.

---

## Linux

### "ensurepip is not available" ou "python3 não encontrado"

Falta o módulo venv do Python:

```bash
sudo apt install python3 python3-venv
```

(Fedora: `sudo dnf install python3-virtualenv`)

### AppImage não abre / "dlopen(): error loading libfuse.so.2"

```bash
sudo apt install libfuse2
```

### Janela não renderiza no Wayland

```bash
./Skkribe-1.0.0.AppImage --ozone-platform=x11
```

---

## Build local

### `cmake não encontrado`

- **macOS:** `brew install cmake`
- **Windows:** instale o "Visual Studio Build Tools 2022" com o workload
  "Desktop development with C++", e use o "Developer PowerShell for VS 2022"
- **Linux:** `sudo apt install cmake build-essential`

### Windows: `whisper-cli.exe não encontrado` depois do build

A compilação falhou silenciosamente. Role o log do `pnpm run setup:whisper` pra
cima e procure o erro real do MSVC. Geralmente é o workload C++ faltando no
Build Tools.

### Windows: `python.exe não existe em resources/python/runtime`

Você pulou o passo de baixar o Python portátil. Veja o passo 4 em
[build-windows.md](build-windows.md).

### `pnpm install` falha no Electron / postinstall

```bash
pnpm approve-builds      # aprove electron, electron-builder, ffmpeg-static
# ou
pnpm rebuild electron
```

### A build empacotou mas o ffmpeg não roda no app instalado

Confirme que o `asarUnpack` em `package.json` inclui
`node_modules/ffmpeg-static/ffmpeg*`. O binário precisa ficar **fora** do
`app.asar` pra ser executável.

---

## GitHub Actions (CI)

### "The job was not started because recent account payments have failed..."

Não é erro de código — é cota de minutos do GitHub Actions. Opções:

- Aumentar o spending limit em github.com/settings/billing
- Tornar o repositório **público** (Actions grátis ilimitado)
- Esperar a cota resetar (dia 1 do mês)

> Builds de **macOS** consomem **10x** mais minutos que Linux. Se a cota está
> apertada, deixe só o Windows/Linux ligados no matrix do workflow.

### Re-rodar não pega o último commit

"Re-run failed jobs" reexecuta no **mesmo commit** antigo. Pra rodar o código
novo, use **"Run workflow"** (dispatch) na branch, ou faça um push novo.

---

## Resetar tudo (começar do zero)

Se o setup ficou num estado quebrado, delete a pasta de dados do usuário e
reabra o app — ele refaz o setup:

- **macOS:** `~/Library/Application Support/skkribe/`
- **Windows:** `%APPDATA%\skkribe\`
- **Linux:** `~/.config/skkribe/`

> Em **dev** (rodando do código), os dados ficam em `resources/` no próprio
> repositório — apague `resources/python/venv`, `resources/python/hf_cache`,
> `resources/python/.hf-token` e `resources/whisper/models`.
