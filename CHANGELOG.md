# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

O workflow de release extrai a seção da versão da tag e usa como corpo do
Release no GitHub — mantenha os títulos no formato `## [x.y.z]`.

---

## [1.1.0]

Versão focada em **velocidade** e **qualidade da identificação de vozes**.

### ⚠️ Ao atualizar da 1.0.0, leia isto

O modelo de identificação de vozes mudou para um mais preciso, e ele fica num
repositório separado da HuggingFace. Duas coisas acontecem na primeira abertura:

1. **Você precisa aceitar as condições do modelo novo.** Abra
   [pyannote/speaker-diarization-community-1](https://huggingface.co/pyannote/speaker-diarization-community-1)
   e clique em "Agree and access repository" com a **mesma conta** do seu token.
   Aceitar o modelo antigo não vale para o novo.
2. **O ambiente Python é reconstruído sozinho** (~2 GB de download, uma vez só).
   Não precisa fazer nada, só esperar.

> Se seu token for do tipo *fine-grained*, confirme que ele tem a permissão
> "Read access to contents of all public gated repos" — sem ela o download falha
> com um erro 401 mesmo depois de aceitar as condições.

### Adicionado

- **Modos de qualidade**: escolha entre **Rápido** (`large-v3-turbo`, ~574 MB),
  **Padrão** (`large-v3`, ~1,1 GB) e **Máximo** (`large-v3` f16, ~3,1 GB). O
  modelo é baixado sob demanda na primeira vez que você usa cada modo, e a
  escolha fica lembrada.
- **Aceleração por GPU no Windows e Linux** via Vulkan (funciona em NVIDIA, AMD
  e Intel). O app detecta o driver automaticamente e cai para CPU quando não
  existe — nada para instalar ou configurar. O macOS já usava Metal.
- **Botão "Trocar token"** na tela de erro, quando a falha é de autenticação.
  Antes, um token inválido deixava o app num beco sem saída: só havia "Tentar de
  novo", que reusava o mesmo token para sempre.
- **Janela redimensionável** com tamanho e posição lembrados entre sessões.

### Melhorado

- **Transcrição e identificação de vozes agora rodam ao mesmo tempo.** A
  diarização só precisa do áudio, não do texto — então ela começa junto com a
  transcrição em vez de esperar. O tempo total passa a ser o do mais lento dos
  dois, em vez da soma.
- **Identificação de vozes mais precisa**: migração do
  `speaker-diarization-3.1` para o `speaker-diarization-community-1`, que erra
  menos na contagem de pessoas e confunde menos quem falou.
- **Cortes de áudio alinhados a pausas.** Os blocos de ~60 s agora são cortados
  numa pausa da fala (deslizando até ±20 s), nunca no meio de uma palavra. Antes,
  a palavra da emenda saía truncada ou duplicada a cada bloco.
- **Timestamps de palavra mais precisos** via alinhamento DTW sobre os pesos de
  atenção do modelo, em vez da heurística de duração. Como a atribuição de
  falante compara tempos, timestamp melhor significa menos palavra creditada à
  pessoa errada.
- **Beam search fixado** (`-bs 5`) e **flash attention** ativado quando há GPU.
- Interface: telas centralizadas verticalmente, barras de rolagem finas no
  Windows e Linux, coluna de leitura centralizada em janelas largas, e a barra de
  título nativa preservada fora do macOS.

### Corrigido

- **Palavras eram atribuídas ao falante errado, cada vez mais ao longo do
  áudio.** Com o detector de voz ligado, o whisper.cpp remapeia para a linha do
  tempo original apenas os tempos de *segmento* — os de *token* ficavam na linha
  filtrada. Cada palavra ficava adiantada pelo total de silêncio removido antes
  dela, um erro que crescia durante o arquivo. Os tempos de token agora são
  rescalados para o intervalo correto do segmento.
- **Crash "instrução ilegal" em processadores mais antigos.** Os binários eram
  compilados com `-march=native`, ou seja, otimizados para o processador da
  máquina que compilou (um runner do GitHub). Windows e Linux agora usam AVX2
  como linha de base compatível.
- Falha na identificação de vozes agora aparece **imediatamente**, em vez de
  depois de toda a transcrição. Mensagem de erro de acesso à HuggingFace agora
  explica as duas causas possíveis (condições não aceitas ou token sem permissão
  para repositórios restritos).

### Interno

- Removidos os travamentos de dependência `torch<2.6` e `huggingface_hub<0.24`,
  que existiam por limitações do pyannote 3.x.
- `diarize.py` deixou de ser duplicado dentro de `setup-diarization.js`; o
  arquivo do repositório passou a ser a única fonte.
- Novos documentos: [SOBRE_O_PROJETO.md](docs/SOBRE_O_PROJETO.md) e
  [COMO_FUNCIONA.md](docs/COMO_FUNCIONA.md).

---

## [1.0.0]

Primeira versão pública.

- Transcrição local com whisper.cpp (`large-v3`) e identificação de falantes com
  pyannote.audio (`speaker-diarization-3.1`).
- Blocos de 60 s transcritos em paralelo, com detector de voz (Silero VAD) para
  evitar texto inventado no silêncio.
- Atribuição de falante palavra a palavra, com remoção de falantes-fantasma e
  suavização de trocas de turno.
- Instaladores para macOS (`.dmg`), Windows (`.exe`) e Linux (`.AppImage`).
- Configuração automática na primeira execução: modelos, ambiente Python e pesos.
- Renomear participantes, copiar tudo ou por pessoa, exportar em Markdown.
