# Primeiros passos (usuário final)

Este guia é pra quem **baixou o instalador** e quer usar o Skkribe. Não precisa
saber programar.

---

## 1. Instalar

Baixe o arquivo da sua plataforma em
[Releases](https://github.com/kaique-oliveira/skkribe/releases):

| Sistema | Arquivo | Como instalar |
|---|---|---|
| **macOS** | `Skkribe-1.0.0-arm64.dmg` | Abra o `.dmg`, arraste o Skkribe pra pasta Aplicativos |
| **Windows** | `Skkribe Setup 1.0.0.exe` | Execute, siga o instalador |
| **Linux** | `Skkribe-1.0.0.AppImage` | Dê permissão de execução e abra (veja abaixo) |

### macOS: "app não verificado"

Como o app não é assinado pela Apple, na primeira abertura o macOS bloqueia.
**Clique com o botão direito → Abrir → Abrir** (só na primeira vez).

### Linux: rodar o AppImage

```bash
chmod +x Skkribe-1.0.0.AppImage
./Skkribe-1.0.0.AppImage
```

Se der erro de FUSE no Ubuntu 22.04+:

```bash
sudo apt install libfuse2
```

---

## 2. Primeira execução (uma vez só)

Na primeira vez que abrir, o Skkribe precisa de duas coisas:

### a) Um token gratuito da HuggingFace

O modelo que reconhece **quem está falando** (pyannote.audio) é gratuito mas
exige que você aceite os termos de uso dele. Por isso o app pede um "token".

A própria tela do app mostra o passo a passo, mas resumindo:

1. Crie uma conta grátis em [huggingface.co](https://huggingface.co)
2. Aceite as condições (botão **"Agree and access repository"**) em:
   - https://huggingface.co/pyannote/speaker-diarization-community-1
3. Gere um token (tipo **Read**) em
   [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
4. Cole no app (começa com `hf_`)

> O token fica salvo **só no seu computador**. Nunca é enviado pra ninguém além
> da própria HuggingFace pra baixar os modelos.

### b) O download dos modelos (~2,7 GB)

Depois do token, o app baixa e configura tudo sozinho:

- Modelo de transcrição (~1 GB)
- Ambiente Python com pyannote.audio (~1,5 GB)
- Pesos de identificação de vozes (~100 MB)

Leva de **5 a 15 minutos** dependendo da sua internet. **Só na primeira vez**,
depois abre instantâneo.

---

## 3. Transcrever um áudio

1. Arraste um arquivo de áudio ou vídeo pra janela (ou clique pra escolher)
2. O app pergunta **quantas pessoas falam** no áudio:
   - **Não sei** → deixa a IA detectar
   - **1 pessoa** → monólogo (mais rápido, sem separar vozes)
   - **2 ou 3 pessoas** → força exatamente esse número (resultado melhor)
3. Aguarde. O tempo depende do tamanho do áudio e do seu computador:
   - **Mac (Apple Silicon)**: rápido, usa a GPU
   - **Windows / Linux (CPU)**: mais lento, ~1x a 2x a duração do áudio

> O app traz o próprio Python embutido, você **não** precisa ter Python
> instalado em nenhuma plataforma.
4. Pronto! Renomeie as pessoas, copie as falas, exporte em Markdown.

---

## Formatos aceitos

**Áudio:** mp3, m4a, wav, ogg, flac, aac, opus
**Vídeo:** mp4, mov, m4v, mkv, webm, avi (extrai o áudio automaticamente)

---

## Deu algum erro?

Veja [TROUBLESHOOTING.md](TROUBLESHOOTING.md), cobre os problemas mais comuns
(token inválido, Python faltando no Linux, download interrompido, etc).
