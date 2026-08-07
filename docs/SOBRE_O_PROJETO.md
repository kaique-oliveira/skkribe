# Skkribe

**Transcrição de áudio com identificação de quem falou, 100% offline, em macOS, Windows e Linux.**

Você joga uma reunião, entrevista, podcast ou áudio de WhatsApp no app e recebe a
transcrição já separada por pessoa, com marcação de tempo. Nada sai do seu
computador: não há servidor, não há conta paga, não há upload.

```
Pessoa 1   00:00
Bom dia, vamos começar a reunião de hoje.

Pessoa 2   00:04
Perfeito. Eu preparei os números do trimestre.
```

| | |
|---|---|
| **Stack** | Electron · React · Vite · TailwindCSS · Python · C++ (whisper.cpp) · PyTorch |
| **Plataformas** | macOS (arm64), Windows (x64), Linux (x64) |
| **Licença** | MIT |
| **Código** | ~1.200 linhas no processo main, ~1.650 no renderer, ~330 em Python, ~515 em scripts de build |

---

## 1. O problema

Transcrever áudio é um problema resolvido — desde que você aceite mandar o
arquivo para a nuvem. Serviços como Otter, Fireflies e a própria API da OpenAI
funcionam bem, mas exigem enviar o conteúdo para um terceiro e pagar por minuto
transcrito.

Isso é inviável para uma classe inteira de casos de uso:

- **Consultas médicas, sessões de terapia, reuniões jurídicas** — o conteúdo é
  sigiloso por obrigação legal (LGPD, sigilo profissional).
- **Entrevistas de pesquisa e jornalismo** — proteção de fontes.
- **Reuniões corporativas internas** — política de dados da empresa proíbe.
- **Uso pessoal em volume** — o custo por minuto não fecha.

Existem modelos abertos excelentes para resolver isso localmente (Whisper da
OpenAI para transcrição, pyannote.audio para diarização), mas colocá-los para
funcionar exige compilar binários em C++, montar um ambiente Python com PyTorch,
autenticar em repositórios com acesso restrito e orquestrar tudo pela linha de
comando. É um obstáculo intransponível para quem não é desenvolvedor.

**O Skkribe fecha exatamente essa lacuna:** entrega a qualidade do estado da arte
open source com a facilidade de um app de duplo clique.

---

## 2. O que o app faz

### Entrada
Aceita praticamente qualquer arquivo de mídia, por seleção ou arrastar-e-soltar:

- **Áudio** — MP3, M4A, WAV, OGG, FLAC, AAC, OPUS
- **Vídeo** — MP4, MOV, M4V, MKV, WEBM, AVI (a trilha de áudio é extraída)

### Processamento
O usuário faz duas escolhas simples antes de começar, e ambas alteram o
comportamento do pipeline:

**Quantas pessoas falam?** — "Não sei" (detecção automática), 1, 2 ou 3 pessoas.
Não é enfeite: quando o usuário informa o número, ele vira uma restrição rígida
no algoritmo de agrupamento, o que melhora muito o resultado (detalhado na
seção 5).

**Modo de qualidade** — três opções, com o modelo baixado sob demanda na
primeira vez que cada um é usado:

| Modo | Modelo | Tamanho | Quando usar |
|---|---|---|---|
| **Rápido** | `large-v3-turbo` (q5_0) | ~574 MB | Áudio limpo. Decoder de 4 camadas em vez de 32 — várias vezes mais rápido, com penalidade média de ~0,4 ponto percentual de WER |
| **Padrão** | `large-v3` (q5_0) | ~1,1 GB | Melhor equilíbrio, é o default |
| **Máximo** | `large-v3` (f16) | ~3,1 GB | Precisão total, para áudio difícil ou quando cada nome próprio importa |

### Saída
Uma transcrição navegável, agrupada por turno de fala, com marcação de tempo em
cada linha. A partir dela o usuário pode:

- **Renomear os participantes** — trocar "Pessoa 1" por "Dra. Helena" em toda a
  transcrição de uma vez, com cores consistentes por pessoa
- **Copiar tudo** com timestamps e nomes
- **Copiar a fala de uma pessoa só** — útil para isolar o que um participante
  específico disse ao longo de toda a reunião
- **Exportar em Markdown** — com cabeçalho de metadados (duração, participantes,
  contagem de palavras) e seções por falante

---

## 3. Arquitetura

O app é um Electron com separação estrita de responsabilidades e três processos
distintos em jogo.

```
┌─────────────────────────────────────────────────────────────┐
│  RENDERER (Chromium)  ·  React + Vite + Tailwind            │
│  Só desenha a interface. Sem acesso ao sistema de arquivos, │
│  sem Node integration. É a fronteira de segurança.          │
└─────────────────────────────────┬───────────────────────────┘
                                  │  IPC via preload
                    (superfície mínima e explícita)
┌─────────────────────────────────┴───────────────────────────┐
│  MAIN (Node.js)  ·  Orquestrador                            │
│  Gerencia processos, arquivos temporários, downloads,       │
│  timeouts e o ciclo de vida da janela.                      │
└──────┬─────────────────────┬────────────────────┬───────────┘
       │                     │                    │
   ┌───┴────┐          ┌─────┴──────┐      ┌──────┴───────┐
   │ ffmpeg │          │ whisper.cpp│      │ diarize.py   │
   │ (bin)  │          │ (C++, N×)  │      │ (Python/     │
   │        │          │            │      │  PyTorch)    │
   └────────┘          └────────────┘      └──────────────┘
```

O `preload.js` define nominalmente cada função que o renderer pode chamar
(`transcribe`, `saveMarkdown`, `checkSetup`…). Tudo fora dessa lista é
inalcançável a partir do código da interface — `contextIsolation` ligado e
`nodeIntegration` desligado.

---

## 4. O pipeline de transcrição

Este é o núcleo técnico do projeto. O fluxo completo:

```
        seu áudio (mp3, m4a, mp4, …)
                    │
                    ▼
        ┌───────────────────────┐
        │  ffmpeg               │  → WAV 16 kHz mono
        │  + silencedetect      │  → mapeia as pausas
        └───────────┬───────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌───────────────┐      ┌──────────────────┐
│ whisper.cpp   │      │  pyannote.audio  │   ← AO MESMO TEMPO
│ N blocos em   │      │  no áudio        │
│ paralelo      │      │  inteiro         │
│ + VAD + DTW   │      │                  │
└───────┬───────┘      └────────┬─────────┘
        │ texto + tempos        │ "de X a Y falou o speaker Z"
        └───────────┬───────────┘
                    ▼
        atribuição palavra-a-palavra
        (sobreposição temporal + histerese)
                    │
                    ▼
        transcrição separada por pessoa
```

### Passo 1 — Normalização
Qualquer formato vira WAV 16 kHz mono PCM, que é o que ambos os modelos esperam.
Usa o binário do pacote `ffmpeg-static`, embutido no app — não depende de o
usuário ter ffmpeg instalado.

### Passo 2 — Corte em blocos alinhados a silêncios
Para transcrever em paralelo é preciso fatiar o áudio. A abordagem ingênua
(cortar a cada 60 segundos exatos) corta palavras ao meio: a palavra da emenda
sai truncada ou duplicada nos dois blocos, e o contexto da frase se perde.

A solução: o `silencedetect` do ffmpeg mapeia todas as pausas do áudio, e cada
corte de ~60 s **desliza até ±20 s** para cair no meio do silêncio mais próximo.
Quando não há pausa alguma na janela (fala contínua, música), o corte volta ao
alvo exato. Cada bloco carrega o próprio offset real, já que os cortes deixam de
ser uniformemente espaçados.

### Passo 3 e 4 — Transcrição e diarização, em paralelo
**Esta é a principal decisão de performance do projeto.** A diarização não
depende do texto: o pyannote só precisa do áudio para determinar quem fala
quando. O casamento entre texto e falante acontece só no final.

Então o processo Python é disparado assim que o WAV fica pronto e roda enquanto o
whisper transcreve. O tempo total passa de `whisper + pyannote` para
`max(whisper, pyannote)` — praticamente metade em áudios longos.

A sincronização é feita por arquivo: o main escreve o JSON do whisper de forma
atômica (arquivo temporário seguido de `rename`), e o `diarize.py`, rodando com a
flag `--wait-json`, só bloqueia esperando esse arquivo **depois** de já ter
concluído a parte pesada. A escrita atômica garante que a simples existência do
arquivo significa "está completo" — não existe janela para ler um JSON pela
metade.

Há também um detalhe de robustez: se a diarização falhar cedo (token inválido,
por exemplo), o erro aparece imediatamente e a transcrição é abortada, em vez de
o usuário esperar meia hora para só então descobrir o problema.

#### Configuração do whisper.cpp

| Flag | Por quê |
|---|---|
| `--output-json-full` | Timestamps por token — base para a atribuição palavra-a-palavra |
| `--vad --vad-model` | Silero VAD pula regiões de silêncio antes de decodificar. Sem isso o Whisper alucina texto no vazio ("[Música]", créditos de legenda inventados) |
| `--suppress-nst` | Descarta tokens de não-fala que escapam mesmo com VAD |
| `-dtw <preset>` | Alinhamento por *Dynamic Time Warping* sobre os pesos de atenção — timestamps de token muito mais fiéis que a heurística padrão |
| `-bs 5` | Beam search explícito, fixado para que uma mudança de default do CLI não degrade a qualidade silenciosamente |
| `-fa` | Flash attention, ativado apenas quando há GPU de verdade |
| `-mc 64` | Limita o contexto arrastado entre segmentos. Com o default (ilimitado), o decoder ecoa alucinações anteriores para a frente, gerando loops de repetição |

#### Paralelismo
O número de processos e threads é calculado a partir dos núcleos disponíveis,
mirando ~4 threads por worker — o ponto ótimo do whisper.cpp. Abaixo de 2
threads o worker fica lento; acima de 4, o retorno é decrescente.

```
8 núcleos  → 2 workers × 4 threads
12 núcleos → 3 workers × 4 threads
16 núcleos → 4 workers × 4 threads
```

Com GPU via Vulkan o número de workers é limitado a 2, porque cada processo
carrega a própria cópia do modelo para a VRAM.

### Passo 5 — Casar palavras com falantes
O `diarize.py` recebe as palavras com seus tempos e os turnos de fala, e faz a
junção em quatro etapas — descritas na próxima seção.

---

## 5. Os problemas difíceis, e como foram resolvidos

Esta seção é o coração do projeto: os detalhes que separam "roda" de "funciona
bem".

### Falantes-fantasma
O pyannote frequentemente produz N+1 falantes, onde o extra aparece por poucos
segundos espalhados — quase sempre um trecho mal classificado de alguém que já
existe. Ele infla a contagem de pessoas e rouba frases de quem realmente falou.

**Solução:** um falante cujo tempo total é menor que 5 segundos **ou** menor que
4% da fala total é dissolvido, e cada um dos seus turnos é reatribuído ao
falante real temporalmente mais próximo. Com salvaguarda: se *todos* estiverem
abaixo do limiar (áudio muito curto), nada é alterado.

### Blips de troca de falante
Um turno de 300 ms atribuído a X, ensanduichado entre dois turnos de Y, quase
nunca é uma interjeição real — é ruído do agrupamento.

**Solução:** re-segmentação por restrição, que funde o trio em um único turno
estendido de Y. O algoritmo itera até o ponto fixo, porque cada fusão pode
expor o próximo blip. A **ordem importa**: a remoção de fantasmas roda primeiro,
senão a regra do "sanduíche" nunca dispara para um blip cujos vizinhos são o
próprio falante fantasma.

### Segmentos que atravessam uma troca de falante
Um segmento do Whisper pode conter o fim da fala de uma pessoa e o começo da
próxima. Atribuir o segmento inteiro a um único falante erra metade dele.

**Solução:** a atribuição é feita **por palavra**, escolhendo o falante com maior
sobreposição temporal (a mesma abordagem do WhisperX). Depois, palavras
consecutivas do mesmo falante são reagrupadas em segmentos — o que efetivamente
divide o segmento original exatamente onde a voz muda.

Sobre isso roda uma **histerese**: uma sequência de menos de 3 palavras atribuída
a X, cercada dos dois lados pelo mesmo falante Y, é reescrita como Y. O critério
é deliberadamente estrito (ambos os lados precisam concordar) para não atropelar
trocas de turno legítimas.

### O bug de linha do tempo do VAD
Este foi o mais sutil de todos e vale contar inteiro.

Com o VAD ligado, o whisper.cpp remapeia para a linha do tempo original apenas os
timestamps de **segmento**. Os timestamps de **token** permanecem na linha do
tempo filtrada, de onde o silêncio foi removido.

Consequência: cada palavra ficava deslocada pelo total de silêncio removido antes
dela — um erro que **cresce ao longo do arquivo**. Como a atribuição de falante é
feita por sobreposição temporal, palavras eram sistematicamente creditadas a
quem falava em outro momento. O sintoma não era um erro visível, era uma
diarização silenciosamente pior, e piorando conforme o áudio avançava.

**Solução:** rescalar linearmente os tokens de cada segmento para o intervalo (já
remapeado) daquele segmento. Quando o VAD não removeu nada, a transformação é
praticamente a identidade — então é seguro aplicar sempre.

### Restrição rígida vs. dica suave na contagem de falantes
Quando o usuário informa quantas pessoas há, existem duas formas de passar isso
ao pyannote: `min_speakers`/`max_speakers` (dica) ou `num_speakers` (restrição).

Em testes lado a lado, a dica suave deixava o modelo derivar para N+1 falantes
fantasma. A restrição rígida força exatamente N agrupamentos e produz resultado
consistentemente melhor. Quem genuinamente não sabe escolhe "Não sei", que deixa
a detecção automática agir.

### Binários que crashavam em CPUs mais antigas
O build compilava com `GGML_NATIVE=ON`, que aplica `-march=native`: o binário sai
otimizado para a CPU **da máquina que compilou**. Como o build roda no CI do
GitHub, qualquer usuário com processador mais antigo que o do runner receberia um
crash de *illegal instruction* — um bug que não aparece em nenhum teste do
desenvolvedor, só na máquina do usuário final.

**Solução:** builds distribuídos para Windows e Linux usam `GGML_NATIVE=OFF` com
AVX2 como linha de base (Haswell, 2013+). No macOS a flag continua ligada, já que
compilamos em Apple Silicon para Apple Silicon.

### Token presente porém inútil
A verificação de configuração perguntava apenas "existe um token salvo?". Mas um
token pode existir e não funcionar — revogado, de outra conta, ou do tipo
*fine-grained* criado sem a permissão de leitura de repositórios restritos (essa
última é fácil de passar batido e devolve um 401 genérico).

O resultado era um beco sem saída: a tela de erro oferecia só "Tentar de novo",
que recarregava e reusava o mesmo token ruim, para sempre.

**Solução:** um botão "Trocar token" que aparece apenas quando a falha é de
autenticação, apaga o token salvo e reabre o formulário. A detecção é feita por
uma função dedicada, testada contra as mensagens reais de erro — incluindo casos
negativos (falha de ffmpeg, whisper travado, download incompleto) que **não**
devem oferecer o botão.

---

## 6. Aceleração por GPU

| Plataforma | Backend | Como |
|---|---|---|
| macOS | **Metal** | Compilado no binário, sempre ativo em Apple Silicon |
| Windows / Linux | **Vulkan** | Binário adicional `main-vulkan` distribuído junto |
| Qualquer | CPU | Fallback automático |

Vulkan foi escolhido em vez de CUDA por ser neutro de fornecedor: funciona em
NVIDIA, AMD e Intel com o mesmo binário, e atinge cerca de 70–90% da velocidade
do CUDA. Uma build CUDA cobriria só uma marca e triplicaria o tamanho do
instalador.

A estratégia de distribuição é *dois binários, um instalador*: o app testa o
binário Vulkan uma vez por sessão executando-o com `-h`. Se o driver Vulkan não
existir na máquina, o processo nem inicia e o app usa silenciosamente o binário
de CPU. O usuário nunca vê a diferença, e ninguém precisa instalar nada.

O pyannote, no lado Python, escolhe entre MPS (GPU da Apple), CUDA e CPU, nessa
ordem.

---

## 7. Distribuição e primeira execução

O desafio de empacotamento: o app depende de um binário C++, de um ambiente
Python com PyTorch e de modelos de vários gigabytes. Colocar tudo no instalador
produziria um download de ~5 GB e um app impossível de assinar.

A solução separa o que é **embutido** do que é **baixado**:

**Vai dentro do instalador** (pequeno, imutável, assinável)
- Binário do whisper.cpp compilado do código-fonte
- Modelo Silero VAD (~864 KB)
- `diarize.py`
- **Um CPython 3.11 relocável e completo** (~30 MB), em todas as plataformas

**Baixado na primeira execução** (para o diretório gravável do usuário)
- Modelo de transcrição (~1,1 GB)
- Ambiente Python virtual com PyTorch e pyannote.audio (~1,5 GB)
- Pesos da diarização (~100 MB)

### Por que embutir um Python próprio
A pilha de diarização é sensível à versão do Python — a disponibilidade de
*wheels* sempre fica atrás dos lançamentos novos. Um usuário cujo `python3` do
sistema seja muito recente, ou que esteja em Debian/Ubuntu sem o pacote
`python3-venv` (que é distribuído separadamente), falharia na instalação com um
erro incompreensível.

Embarcar um CPython 3.11 conhecido torna a construção do ambiente **determinística
e idêntica nas três plataformas**. Sem loteria de Python do sistema.

### Setup idempotente e versionado
O processo de configuração é dividido em três fases que rodam apenas se
necessário — se o app fechar no meio de um download de 1 GB, a reabertura
retoma de onde parou em vez de recomeçar.

Um marcador de versão de esquema (`VENV_SCHEMA`) registra qual layout de ambiente
foi construído. Quando uma dependência muda de forma incompatível, o número sobe
e o app **reconstrói o ambiente sozinho** — em vez de deixar o usuário com um
`TypeError` de Python indecifrável. Foi exatamente esse mecanismo que permitiu
migrar de pyannote 3.1 para 4.x sem nenhuma intervenção manual.

### Autenticação
Os modelos do pyannote ficam em repositórios de acesso restrito no Hugging Face,
que exigem aceitar as condições de uso. Como o projeto é open source, não é
possível embutir uma credencial compartilhada — cada usuário fornece o próprio
token, guiado por um passo a passo na tela. O token fica salvo apenas localmente
e nunca vai para lugar nenhum além do próprio Hugging Face.

### CI/CD
Um workflow do GitHub Actions compila para as três plataformas em paralelo
(macOS arm64, Windows x64, Ubuntu x64), instalando as *toolchains* necessárias em
cada runner — incluindo o SDK do Vulkan no Windows e no Linux. Ao empurrar uma
tag de versão, os três instaladores (`.dmg`, `.exe`, `.AppImage`) são anexados
automaticamente a um Release.

---

## 8. Design da interface

A interface segue um sistema de design próprio, calmo e sem ruído: fundo branco,
blocos cinza aninhados para dar ênfase, cantos arredondados como regra (canto
vivo é exceção), vermelho de gravação como cor de destaque e sombras suaves em
duas camadas.

Alguns pontos de cuidado:

- **Máquina de estados explícita** — a navegação não é livre; o app percorre
  `carregando → primeira execução → ocioso → escolha de falantes → processando →
  resultado`, com transição para erro a partir de qualquer ponto.
- **Progresso honesto** — o usuário vê a fase atual, uma linha de status vinda
  diretamente do processo em execução, e o tempo decorrido. Como a diarização
  agora roda em paralelo com a transcrição, as mensagens dela são rotuladas como
  "transcrição" até o whisper terminar, para que o indicador de etapas não pule
  para trás e pareça quebrado.
- **Animação com propósito** — entrada em cascata com atraso progressivo por
  elemento (via Framer Motion) e transição suave entre telas, sem nada que atrase
  o uso.
- **Adaptação por plataforma** — no macOS a barra de título é embutida e a faixa
  superior serve de área de arraste; no Windows e Linux a barra nativa é mantida
  e as barras de rolagem do Chromium são estilizadas finas e arredondadas, para
  não destoarem do desenho.
- **Janela flexível** — livremente redimensionável, com tamanho e posição
  lembrados entre sessões. Em janelas largas o texto se mantém numa coluna
  centralizada de leitura, porque linha longa demais destrói a facilidade de
  varrer o texto com os olhos.

---

## 9. Stack completa

### Aplicação
| Tecnologia | Papel |
|---|---|
| **Electron 28** | Empacotamento desktop multiplataforma |
| **React 18** | Interface |
| **Vite 5** | Build e servidor de desenvolvimento |
| **TailwindCSS 3** | Estilos, com tokens de design customizados |
| **Framer Motion 11** | Animação de entrada e transição entre telas |
| **electron-builder** | Geração de `.dmg`, `.exe` (NSIS) e `.AppImage` |

### Motor de transcrição
| Tecnologia | Papel |
|---|---|
| **whisper.cpp** | Inferência do Whisper em C++, compilada do código-fonte |
| **Whisper large-v3 / turbo** | Modelos de reconhecimento de fala da OpenAI |
| **Silero VAD** | Detecção de atividade vocal, evita alucinação em silêncio |
| **ffmpeg** | Conversão, corte e detecção de silêncio |

### Motor de diarização
| Tecnologia | Papel |
|---|---|
| **pyannote.audio 4** | Diarização (quem falou quando) |
| **speaker-diarization-community-1** | Modelo atual, sucessor do 3.1 — mesma qualidade de segmentação, com redução relevante de confusão e erro de contagem entre falantes |
| **PyTorch** | Runtime de inferência, com MPS e CUDA |
| **CPython 3.11 relocável** | Interpretador embutido, para ambiente determinístico |

### Infraestrutura
GitHub Actions (matriz de 3 plataformas), CMake, Vulkan SDK, Hugging Face Hub.

---

## 10. Resumo das decisões de engenharia

| Decisão | Motivo |
|---|---|
| Transcrição e diarização em paralelo | Tempo total vira `max()` em vez de soma — quase metade em áudios longos |
| Cortes alinhados a silêncios | Elimina palavras fatiadas e perda de contexto nas emendas |
| Atribuição por palavra, não por segmento | Segmentos do Whisper atravessam trocas de falante |
| Rescalonamento de timestamps do VAD | Corrige um desalinhamento crescente que degradava a diarização em silêncio |
| Restrição rígida na contagem de falantes | Dicas suaves deixam o modelo inventar falantes-fantasma |
| Vulkan em vez de CUDA | Um binário cobre NVIDIA, AMD e Intel |
| `GGML_NATIVE=OFF` nos builds distribuídos | Evita crash de instrução ilegal em CPUs mais antigas que a do CI |
| Python embutido | Elimina a loteria do Python do sistema; ambiente idêntico nas 3 plataformas |
| Modelos baixados em vez de embutidos | Instalador pequeno e assinável, em vez de ~5 GB |
| Setup versionado por esquema | Migrações de dependência acontecem sozinhas, sem erro críptico |
| pyannote em Python, não nativo | É o estado da arte em diarização; não há equivalente maduro em C++ |

---

## 11. O que aprendi

**Paralelismo mora nas dependências de dados, não na estrutura do código.** O
pipeline *parecia* sequencial porque estava escrito em sequência. Perceber que a
diarização só precisava do áudio — e não do texto — foi o que liberou o maior
ganho de desempenho do projeto, sem trocar nenhum modelo nem tocar em nenhum
algoritmo.

**Os piores bugs não quebram nada.** O desalinhamento de timestamps do VAD não
gerava exceção, log ou tela de erro. Produzia uma diarização discretamente pior,
e piorando ao longo do arquivo. Encontrar esse tipo de defeito exige raciocinar
sobre o que o sistema *deveria* produzir, não esperar que ele reclame.

**Empacotar IA é tão difícil quanto usá-la.** A parte de aprendizado de máquina é
madura e bem documentada. Entregar isso como um app que um usuário não técnico
instala e usa — binários que não crasham em hardware antigo, ambientes Python
determinísticos, migrações automáticas, autenticação em repositórios restritos —
consumiu tanto esforço de engenharia quanto o pipeline em si.

**Estado inválido precisa de saída.** O beco sem saída do token era uma falha de
design, não de código: o sistema sabia que algo estava errado, mas não oferecia
nenhum caminho para corrigir. Toda condição de erro merece a pergunta "e agora,
o que o usuário faz?".

---

## Créditos

Construído sobre [whisper.cpp](https://github.com/ggml-org/whisper.cpp) e
[pyannote.audio](https://github.com/pyannote/pyannote-audio).

**Autor:** Kaique Oliveira · **Licença:** MIT
