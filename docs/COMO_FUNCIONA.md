# Como o Skkribe consegue transcrição boa, rápida e diarização precisa

Documento técnico sobre as decisões que produzem o resultado. Cada seção segue o
mesmo formato: **o problema concreto**, **por que a solução óbvia falha** e **o
que foi feito**.

Três objetivos puxam em direções opostas — modelo maior transcreve melhor mas
demora mais; cortar o áudio em pedaços acelera mas quebra o contexto; timestamps
mais precisos custam processamento. O que segue é o mapa desses conflitos e das
escolhas feitas em cada um.

> **Sobre os números:** valores marcados como *publicados* vêm de benchmarks dos
> projetos originais (OpenAI, pyannote). Valores marcados como *medido* foram
> obtidos em teste local. Onde não há medição, o texto diz explicitamente que a
> justificativa é de raciocínio, não de experimento.

---

## Índice

**Parte I — Qualidade da transcrição**
1. Escolha do modelo, e por que quantização importa menos que o tamanho
2. O maior inimigo: alucinação no silêncio
3. Loops de repetição e o contexto que se envenena
4. Cortar o áudio sem destruir palavras
5. Beam search fixado

**Parte II — Velocidade**
6. A decisão que mais rendeu: paralelizar tarefas independentes
7. Paralelismo interno: o equilíbrio entre processos e threads
8. GPU sem fragmentar a distribuição
9. Deixar o usuário escolher o ponto na curva

**Parte III — Qualidade da diarização**
10. O modelo, e por que trocar valeu a pena
11. Timestamps de palavra: o alicerce invisível
12. O bug que degradava tudo em silêncio
13. Falantes-fantasma
14. Blips de troca de turno
15. Atribuição por palavra, não por segmento
16. Histerese: suavizar sem atropelar
17. Restrição rígida vs. dica suave
18. A ordem das operações importa

**Parte IV**
19. Como tudo se encaixa
20. Como verifiquei

---

# Parte I — Qualidade da transcrição

## 1. Escolha do modelo, e por que quantização importa menos que o tamanho

O Whisper tem várias famílias. A `large-v3` é a melhor em nomes próprios,
termos técnicos e palavras raras — justamente o que mais frustra numa
transcrição de reunião, porque é o que o leitor não consegue adivinhar pelo
contexto.

O modelo é distribuído em várias precisões. O padrão do app usa **q5_0**,
quantizado, com ~1,1 GB em vez dos ~3,1 GB da versão em ponto flutuante. A troca
compensa: a perda de qualidade da quantização é pequena perto do salto que se
obtém ao usar um modelo *maior* na mesma quantidade de memória. Um `large-v3`
quantizado supera com folga um modelo médio em precisão total.

Para quem quer o teto absoluto, o modo **Máximo** baixa o `large-v3` em f16.

```js
balanced: { file: 'ggml-large-v3-q5_0.bin', dtw: 'large.v3' }   // padrão
max:      { file: 'ggml-large-v3.bin',      dtw: 'large.v3' }   // precisão total
```

---

## 2. O maior inimigo: alucinação no silêncio

**O problema.** O Whisper foi treinado em vídeos legendados da internet. Quando
recebe silêncio, ruído de ar-condicionado ou música de fundo, ele não devolve
vazio — ele *inventa*. Os artefatos são característicos e reconhecíveis:
`[Música]`, `[Aplausos]`, agradecimentos de fim de vídeo e créditos de legenda
com nomes de tradutores que nunca existiram naquele áudio.

Isso é pior do que parece, e o motivo é a diarização: um trecho de texto
fantasma ocupa uma faixa de tempo real. O diarizador vai atribuir aquela faixa a
alguém, e esse alguém recebe uma frase que ninguém disse. **Uma alucinação de
transcrição vira um erro de atribuição.**

**Por que a solução óbvia falha.** Filtrar o texto depois, por lista de frases
conhecidas, é um jogo de gato e rato: as alucinações variam por idioma, por
duração do silêncio e por versão do modelo. Você nunca termina a lista.

**O que foi feito.** Atacar antes da decodificação, com duas camadas:

```js
'--vad', '--vad-model', <silero>   // não decodifica o que não é fala
'--suppress-nst'                   // descarta tokens de não-fala remanescentes
```

O **Silero VAD** (detector de atividade vocal, ~864 KB, embutido no instalador)
roda antes do Whisper e marca onde há fala. As regiões silenciosas simplesmente
não chegam ao decodificador — se ele nunca vê o silêncio, não tem o que
alucinar. O `--suppress-nst` é a rede de segurança para tokens de não-fala que
escapam mesmo assim.

Efeito colateral: como regiões silenciosas não são decodificadas, o processo
também fica **mais rápido**. Um dos poucos casos em que qualidade e velocidade
andam juntas.

> Essa mesma decisão criou o bug mais sutil do projeto — o VAD altera a linha do
> tempo. Ver a seção 12.

---

## 3. Loops de repetição e o contexto que se envenena

**O problema.** O Whisper é autorregressivo: ao decodificar um segmento, ele
recebe o texto dos segmentos anteriores como contexto. Isso é bom — dá
continuidade a pronomes e assunto.

Mas cria um caminho de realimentação. Se um segmento sai errado, o erro entra no
contexto do próximo. O modelo, tentando ser coerente com o que "já foi dito",
repete a variação. O sintoma clássico é a mesma frase repetida dezenas de vezes,
ou um trecho que deriva para um texto totalmente inventado e não volta mais.

**Por que a solução óbvia falha.** Zerar o contexto entre segmentos elimina o
loop, mas custa caro: o modelo perde a continuidade e passa a errar concordância,
pronomes e a grafia de nomes próprios que já haviam aparecido.

**O que foi feito.** Limitar o contexto em vez de eliminá-lo:

```js
'-mc', '64'    // máximo de 64 tokens de contexto (o default é ilimitado)
```

64 tokens são suficientes para a coerência de curto alcance que realmente
importa, mas curtos demais para arrastar uma alucinação por todo o arquivo. O
erro fica contido em vez de se propagar.

---

## 4. Cortar o áudio sem destruir palavras

**O problema.** Para transcrever em paralelo é preciso fatiar o áudio (ver seção
7). Mas o corte é destrutivo: o whisper processa cada bloco isoladamente, sem
saber que existe continuação.

Cortar a cada 60 segundos exatos cai no meio de uma palavra com frequência alta —
numa fala contínua, praticamente sempre. O que acontece na emenda:

- A palavra cortada sai truncada nos dois blocos (`"transcri"` + `"ção"`), ou
  aparece duplicada, ou some.
- A frase perde o contexto exatamente no ponto em que o modelo mais precisaria
  dele.
- O erro é **sistemático**: acontece em toda emenda, a cada 60 segundos.

**Por que a solução óbvia falha.** Sobrepor os blocos (transcrever 0–65s, 55–125s
e costurar) resolve a palavra cortada, mas cria o problema de deduplicar a região
sobreposta — e a costura erra justamente quando o modelo transcreveu a mesma fala
de formas ligeiramente diferentes nos dois blocos. Troca-se um erro previsível
por outro imprevisível.

**O que foi feito.** Cortar onde ninguém está falando. O ffmpeg mapeia todas as
pausas do áudio, e cada corte desliza até encontrar uma:

```js
'-af', 'silencedetect=noise=-35dB:d=0.4'   // pausas de 0,4s abaixo de -35dB
```

```js
const PIPELINE = { chunkSeconds: 60, cutSearchWindow: 20 }
```

Cada alvo de ~60 s pode se deslocar **até ±20 segundos** para o meio do silêncio
mais próximo. O algoritmo:

```js
while (last + chunkSeconds < duration - 5) {
  const target = last + chunkSeconds
  // entre os silêncios dentro da janela, escolhe o mais próximo do alvo
  const cut = best ?? target        // sem silêncio na janela → corte exato
  cuts.push(cut); last = cut
}
```

Detalhes que importam:

- O corte cai no **meio** do silêncio, não na borda — margem dos dois lados.
- A busca é ancorada no fim do bloco anterior (`last + chunkSeconds`), então o
  desvio não acumula ao longo do arquivo.
- Guardas contra blocos degenerados: nada de silêncio a menos de 5 s do início
  do bloco, e nenhum corte nos últimos 5 s do áudio.
- Sem pausa na janela (música, fala contínua), volta ao corte exato — degrada
  para o comportamento antigo em vez de falhar.

Como os cortes deixam de ser uniformes, cada bloco passa a carregar o próprio
offset real, em vez de `índice × 60`:

```js
{ path: 'chunk_003.wav', offset: 178.42 }
```

---

## 5. Beam search fixado

Decodificação gulosa escolhe o token mais provável a cada passo. *Beam search*
mantém várias hipóteses vivas e escolhe a melhor sequência no fim — melhor em
áudio ambíguo, sotaque carregado ou fala sobreposta.

O whisper.cpp já usa beam 5 por padrão, mas o app **fixa o valor explicitamente**:

```js
'-bs', '5'
```

O motivo é de manutenção, não de qualidade: um default de linha de comando pode
mudar numa atualização, e a degradação seria silenciosa — nenhum erro, nenhum
aviso, só transcrições um pouco piores. Parâmetro que afeta qualidade fica
fixado no código.

---

# Parte II — Velocidade

## 6. A decisão que mais rendeu: paralelizar tarefas independentes

**O problema.** O pipeline original era estritamente sequencial:

```
[───────── whisper ─────────][───────── pyannote ─────────]
                                                          ↑ fim
```

Numa reunião de uma hora, isso é uma espera longa. E o gargalo não estava em
nenhum dos dois modelos — estava na estrutura.

**A observação.** O pyannote determina *quem fala quando* analisando apenas
características acústicas da voz. **Ele nunca olha o texto.** O único ponto em
que as duas saídas se encontram é a junção final, que é aritmética de intervalos
e custa milissegundos.

O código *parecia* sequencial porque estava escrito em sequência. A dependência
real não existia.

**O que foi feito.** Disparar o processo Python assim que o WAV fica pronto:

```
[───────── whisper ─────────]
[──────── pyannote ────────]      ← ao mesmo tempo
                             [×]  ← junção (milissegundos)
```

O tempo total passa de `whisper + pyannote` para **`max(whisper, pyannote)`**.
Sem trocar modelo, sem baixar qualidade, sem tocar em nenhum algoritmo.

### A sincronização

O desafio: o processo Python precisa dos dados do whisper, mas só no fim. A
solução usa o sistema de arquivos como ponto de encontro.

O Python roda com `--wait-json` e faz a espera **depois** do trabalho pesado:

```python
diarization = pipeline(audio_path, **kwargs)   # a parte lenta, sem depender do texto
diar = extract_turns(diarization)

# só agora bloqueia, se o whisper ainda não terminou
if wait_json and not os.path.exists(whisper_json):
    progress("Vozes identificadas. Aguardando a transcrição terminar...")
    while not os.path.exists(whisper_json):
        time.sleep(0.5)
```

O lado Node escreve de forma **atômica**:

```js
fs.writeFileSync(segJson + '.tmp', JSON.stringify({...}))
fs.renameSync(segJson + '.tmp', segJson)      // rename é atômico
```

Isso elimina por construção a condição de corrida clássica de "arquivo como
canal": como o `rename` é atômico, o arquivo nunca existe pela metade. A simples
existência do caminho **significa** que o conteúdo está completo. Não é preciso
lock, sinal ou protocolo de handshake.

### Falhar rápido

Um risco novo do paralelismo: se a diarização morre logo no início (token
inválido, ambiente quebrado), o antigo fluxo sequencial nem teria começado — mas
agora o whisper já está rodando e a execução inteira está condenada.

```js
// diarPromise não pode resolver antes de recebermos o JSON;
// qualquer conclusão precoce é, por definição, uma falha.
const diarFailureGuard = diarPromise
  ? diarPromise.then(() => new Promise(() => {}))   // sucesso → nunca resolve
  : null

whisperSegments = await Promise.race([whisperWork, diarFailureGuard])
```

O erro aparece em segundos, e um sinalizador de aborto impede que novos blocos
sejam enfileirados. Sem isso, o usuário esperaria meia hora para então descobrir
um problema de token.

---

## 7. Paralelismo interno: o equilíbrio entre processos e threads

**O problema.** Com N blocos e M núcleos, quantos processos rodar e com quantas
threads cada um?

O whisper.cpp rende melhor com **2 a 4 threads por processo**. Abaixo de 2, o
processo fica lento e deixa núcleos ociosos. Acima de 4, o retorno cai — a
sincronização interna passa a custar mais do que o paralelismo rende.

**A armadilha.** Uma lógica anterior emitia 6 processos de 1 thread numa máquina
de 8 núcleos: o pior dos dois mundos, com muitos processos disputando I/O e cada
um rodando o whisper de forma essencialmente serial.

**O que foi feito.** Mirar 4 threads por processo e derivar o resto:

```js
function balanceParallelism(cores, chunkCount) {
  const idealWorkers = Math.max(1, Math.floor(cores / 4))
  const workers = Math.max(1, Math.min(idealWorkers, 6, chunkCount || idealWorkers))
  const threadsPerWorker = Math.max(2, Math.floor(cores / workers))
  return { workers, threadsPerWorker }
}
```

| Núcleos | Resultado |
|---|---|
| 4 | 1 × 4 threads |
| 8 | 2 × 4 threads |
| 12 | 3 × 4 threads |
| 16 | 4 × 4 threads |
| 24+ | 6 × 4 threads (teto de processos) |

O piso de 2 threads protege máquinas fracas; o teto de 6 processos evita
saturar memória e I/O. O número de blocos também limita — não adianta abrir 6
processos para 3 blocos.

Os blocos são consumidos por uma fila com reabastecimento: quando um processo
termina, ele puxa o próximo. Isso mantém todos ocupados mesmo com blocos de
durações diferentes (que é justamente o caso, já que os cortes são alinhados a
silêncios).

---

## 8. GPU sem fragmentar a distribuição

**O problema.** GPU acelera muito a inferência, mas cada fabricante quer um
backend diferente. Uma build CUDA cobre só NVIDIA e infla o instalador. Fazer
builds separadas por fabricante multiplica a matriz de CI e obriga o usuário a
saber qual baixar.

**O que foi feito.**

| Plataforma | Backend | Estratégia |
|---|---|---|
| macOS | Metal | Compilado no binário, sempre ativo |
| Windows / Linux | **Vulkan** | Binário adicional no mesmo instalador |
| Qualquer | CPU | Fallback automático |

**Vulkan** foi escolhido por ser neutro de fornecedor: um binário funciona em
NVIDIA, AMD e Intel, atingindo cerca de 70–90% da velocidade do CUDA
(*publicado*). Perder 10–30% em NVIDIA para cobrir todo o resto do mercado com
um único artefato é uma troca claramente favorável.

A distribuição é **dois binários, um instalador**. A escolha acontece em tempo
de execução:

```js
if (process.platform !== 'darwin' && fs.existsSync(p.whisperBinVulkan)) {
  const probe = spawnSync(p.whisperBinVulkan, ['-h'], { stdio: 'ignore', timeout: 15000 })
  if (!probe.error && probe.status === 0) { bin = p.whisperBinVulkan; gpu = true }
}
```

A sondagem é o próprio teste: sem driver Vulkan na máquina, o binário nem
carrega, e o app usa o de CPU. O usuário nunca vê a diferença nem instala nada. O
resultado é cacheado por sessão.

Duas consequências dependem dessa detecção:

```js
if (whisper.gpu) args.push('-fa')          // flash attention só faz sentido com GPU
if (whisper.bin === p.whisperBinVulkan) workers = Math.min(workers, 2)
```

O limite de 2 processos existe porque cada um carrega a própria cópia do modelo
na VRAM — 4 processos com um modelo de 1,1 GB estourariam uma placa de 4 GB.

### O bug de distribuição que veio junto

O build usava `GGML_NATIVE=ON`, que aplica `-march=native`: o binário sai
otimizado para a CPU **da máquina que compila**. Como o build roda no CI do
GitHub, qualquer usuário com processador mais antigo que o do runner receberia
um crash de *instrução ilegal*.

É a pior categoria de bug: invisível em todo teste do desenvolvedor, garantido na
máquina de parte dos usuários.

```js
isMac ? '-DGGML_NATIVE=ON' : '-DGGML_NATIVE=OFF -DGGML_AVX2=ON'
```

No macOS a flag continua ligada — compilamos em Apple Silicon para Apple
Silicon, mesma linha de base. No Windows e Linux, AVX2 (Haswell, 2013+) é o piso
seguro.

---

## 9. Deixar o usuário escolher o ponto na curva

Nem todo áudio precisa do modelo máximo, e nem todo usuário tem o mesmo tempo. Em
vez de fixar um ponto, o app expõe três:

| Modo | Modelo | Tamanho | Compromisso |
|---|---|---|---|
| **Rápido** | `large-v3-turbo` q5_0 | ~574 MB | Decoder de 4 camadas em vez de 32 (809M vs 1.54B parâmetros). Várias vezes mais rápido, com ~0,4 ponto percentual de WER a mais na média (*publicado*) |
| **Padrão** | `large-v3` q5_0 | ~1,1 GB | O equilíbrio, default |
| **Máximo** | `large-v3` f16 | ~3,1 GB | Precisão total |

O `turbo` mantém o *encoder* completo e poda o *decoder*. Como o encoder é quem
"ouve", a compreensão acústica permanece; o que se perde é margem em áudio
degradado, sotaque forte e fala sobreposta — exatamente onde o modo Padrão
continua disponível.

Cada modelo é baixado sob demanda na primeira vez que é escolhido, com barra de
progresso, e a escolha fica lembrada. O instalador não carrega 5 GB de modelos
que talvez nunca sejam usados.

---

# Parte III — Qualidade da diarização

Diarização responde "quem falou quando". É medida por **DER** (*Diarization Error
Rate*), que soma três tipos de erro: fala não detectada, silêncio marcado como
fala e — o mais comum na prática — **confusão de falante**, quando o trecho é
atribuído à pessoa errada.

## 10. O modelo, e por que trocar valeu a pena

O app usa o **`pyannote/speaker-diarization-community-1`**, lançado no fim de
2025 com o pyannote.audio 4.x, substituindo o `speaker-diarization-3.1`.

O ganho é focado exatamente onde dói: mesma qualidade de segmentação, mas
**redução relevante de confusão de falante e de erro na contagem de pessoas**
(*publicado*: no AMI headset, DER de 18,8% para ~17,0%).

Isso importa mais do que o número sugere, porque contagem e confusão são
justamente os problemas que as heurísticas das seções 13 a 16 existem para
remediar. Melhorar a fonte reduz a dependência dos remendos.

A migração trouxe um bônus de manutenção. A versão anterior exigia dois pins de
dependência:

```js
// antes: presos ao passado
'torch<2.6'              // 2.6 mudou o default de torch.load, quebrando os checkpoints
'huggingface_hub<0.24'   // 0.24 removeu o kwarg use_auth_token=
```

O pyannote 4 usa a API moderna do Hugging Face, e ambos os pins caíram. O
projeto voltou a acompanhar as versões atuais de PyTorch.

A troca também aproveita uma saída que o pipeline novo oferece:

```python
for candidate in (
    getattr(diarization, "exclusive_speaker_diarization", None),  # sem sobreposição
    getattr(diarization, "speaker_diarization", None),
    diarization,                                                  # 3.x
):
```

A variante **exclusiva** não tem turnos sobrepostos. Isso encaixa melhor com a
atribuição por sobreposição temporal da seção 15 — regiões de fala simultânea
diluiriam o voto de cada palavra. A cadeia de alternativas mantém compatibilidade
com as duas gerações do pyannote.

---

## 11. Timestamps de palavra: o alicerce invisível

**Por que isso decide a diarização.** A atribuição de falante compara o intervalo
de tempo de cada palavra com os turnos de fala. Se o tempo da palavra estiver
deslocado, ela é comparada com o turno errado — e vai para a pessoa errada.

**A precisão do timestamp de palavra é o teto da precisão da diarização.** Um
diarizador perfeito com timestamps ruins ainda produz atribuição ruim.

**O problema.** Os timestamps padrão do Whisper vêm de heurística sobre a duração
dos tokens, e desviam tipicamente algumas centenas de milissegundos — o que é a
ordem de grandeza de uma troca de turno rápida numa conversa.

**O que foi feito.** Ativar o alinhamento por *Dynamic Time Warping* sobre os
pesos de atenção cruzada do modelo:

```js
if (dtwPreset) args.push('-dtw', dtwPreset)   // 'large.v3' ou 'large.v3.turbo'
```

O DTW usa a informação que o próprio modelo já produziu — em qual parte do áudio
ele estava "prestando atenção" ao emitir cada token — em vez de estimar por
duração. O resultado é substancialmente mais fiel.

Os tokens são então agrupados em palavras. A regra usa a convenção do
tokenizador: espaço inicial abre palavra nova, o resto é continuação.

```js
const dtwMs = (typeof t.t_dtw === 'number' && t.t_dtw >= 0) ? t.t_dtw * 10 : null
const from = (dtwMs !== null && prevDtwMs !== null) ? prevDtwMs : (t.offsets?.from ?? 0)
const to   = (dtwMs !== null) ? dtwMs : (t.offsets?.to ?? 0)
```

Quando o DTW está disponível, o intervalo da palavra é delimitado por marcas
consecutivas; quando não está, cai de volta nos offsets heurísticos. Tokens de
controle (`[_BEG_]`) são descartados, e pontuação gruda na palavra anterior.

---

## 12. O bug que degradava tudo em silêncio

Este foi o defeito mais sutil do projeto, e ilustra por que os piores bugs não
geram erro nenhum.

**O sintoma.** Nenhum. Sem exceção, sem log, sem tela de erro. Apenas uma
diarização pior do que deveria — e que **piorava conforme o áudio avançava**.

**A causa.** O VAD (seção 2) remove o silêncio antes da decodificação, o que cria
**duas linhas do tempo**: a do áudio original e a do áudio filtrado, mais curta.

O whisper.cpp remapeia de volta para a linha original os timestamps de
**segmento**. Mas os timestamps de **token** — e o `t_dtw` — permanecem na linha
filtrada.

Como o pipeline usa os tempos de token para a atribuição, **cada palavra ficava
adiantada pelo total de silêncio removido antes dela**. Num áudio de reunião,
com pausas constantes, isso soma. Depois de vinte minutos o desvio acumulado
pode passar de vários segundos — tempo suficiente para uma palavra ser comparada
com o turno de outra pessoa.

O erro é **cumulativo**: o início do arquivo fica quase certo, e a qualidade se
deteriora progressivamente. É o tipo de defeito que se atribui a "o modelo não é
tão bom assim" em vez de investigar.

**O que foi feito.** Rescalar linearmente os tokens de cada segmento para o
intervalo do segmento — que já está corretamente remapeado:

```js
// tokens estão na linha do VAD; o span do segmento está na linha original
const rawMin = Math.min(...words.map(w => w.start))
const rawMax = Math.max(...words.map(w => w.end))
const scale  = rawSpan > 0 ? segSpan / rawSpan : 0
const remap  = (ms) => segFromMs + (ms - rawMin) * scale
```

Por que funciona: o silêncio é removido **entre** os segmentos, não dentro deles.
Dentro de um segmento a fala é contínua, então uma transformação afim é
suficiente. E quando o VAD não removeu nada, a transformação é praticamente a
identidade — seguro aplicar sempre, sem ramificação condicional.

Por fim, monotonicidade é garantida na saída:

```js
start = Math.max(start, lastEnd)
end   = Math.max(end, start + 0.02)   // sem palavras de duração zero
```

---

## 13. Falantes-fantasma

**O problema.** O pyannote frequentemente produz N+1 falantes, onde o extra
aparece por poucos segundos espalhados em trechos curtos — quase sempre pedaços
mal classificados de alguém que já existe.

O dano é duplo: a contagem de pessoas fica errada (o usuário vê "5 pessoas" numa
conversa de 3), e o fantasma **rouba frases** de quem realmente falou.

**O que foi feito.** Dissolver clusters marginais e redistribuir seus turnos:

```python
def merge_minor_speakers(diar, min_total_sec=5.0, min_fraction=0.04):
    minor = {sp for sp, t in totals.items()
             if t < min_total_sec or (t / grand_total) < min_fraction}
```

Um falante é considerado fantasma se falou **menos de 5 segundos no total** *ou*
representa **menos de 4% da fala**. Os dois critérios são necessários: o
absoluto pega o fantasma em áudio longo, o relativo pega o fantasma em áudio
curto.

Cada turno do fantasma vai para o falante real temporalmente mais próximo — não
para o mais frequente, porque proximidade no tempo é o melhor indício de quem
estava com a palavra naquele momento.

```python
if not minor or len(minor) >= len(totals):
    return diar
```

A salvaguarda importa: num clipe de 8 segundos com duas pessoas, *ambas* ficam
abaixo do limiar. Se todos são marginais, ninguém é — devolve tudo intacto em vez
de fundir a conversa numa pessoa só.

---

## 14. Blips de troca de turno

**O problema.** Um turno de 300 ms atribuído a X, ensanduichado entre dois turnos
de Y, quase nunca é uma interjeição real. É ruído do agrupamento.

**O que foi feito.** Re-segmentação por restrição:

```python
short     = (cur["end"] - cur["start"]) < min_dur          # min_dur = 0.5s
sandwich  = prev["speaker"] == nxt["speaker"] and cur["speaker"] != prev["speaker"]
if short and sandwich:
    # funde os três num único turno estendido de Y
```

O critério é conservador: exige que **os dois vizinhos sejam a mesma pessoa**.
Um turno curto entre dois falantes *diferentes* é preservado, porque aí pode
mesmo ser uma interjeição real numa conversa animada.

O algoritmo itera até o ponto fixo, porque cada fusão pode expor o blip seguinte:

```python
while changed:
    changed = False
    # ... varre e funde
```

---

## 15. Atribuição por palavra, não por segmento

**O problema.** Os segmentos do Whisper são delimitados por pausas de fala e
pontuação — não por troca de falante. Um segmento pode conter o fim da frase de
uma pessoa e o começo da resposta da outra:

```
Segmento: "…então eu acho que sim, claro, mas precisamos ver os números"
           └────── Pessoa 1 ──────┘└────────── Pessoa 2 ──────────┘
```

Atribuir o segmento inteiro a um único falante erra metade dele. E isso acontece
justamente nas trocas de turno — os momentos mais informativos da conversa.

**O que foi feito.** Trabalhar na granularidade da palavra. Para cada uma,
escolher o falante com maior **sobreposição temporal**:

```python
def speaker_for_range(start, end, diar):
    by_speaker = {}
    for d in diar:
        ov = max(0, min(end, d["end"]) - max(start, d["start"]))
        if ov > 0:
            by_speaker[d["speaker"]] = by_speaker.get(d["speaker"], 0) + ov
    if by_speaker:
        return max(by_speaker, key=by_speaker.get)
    # sem sobreposição → turno com o centro mais próximo
    mid = (start + end) / 2
    return min(diar, key=lambda d: abs((d["start"] + d["end"]) / 2 - mid))["speaker"]
```

Palavras consecutivas do mesmo falante são então reagrupadas em segmentos de
saída — o que efetivamente **divide o segmento original exatamente onde a voz
muda**. O usuário vê dois turnos limpos onde o Whisper tinha produzido uma linha
só. É a mesma abordagem do WhisperX.

O fallback por centro mais próximo cobre palavras que caem num vão entre turnos
(o diarizador nem sempre cobre 100% do tempo). Sem ele, essas palavras ficariam
sem falante.

---

## 16. Histerese: suavizar sem atropelar

**O problema.** Mesmo com timestamps bons, a atribuição por palavra oscila nas
fronteiras: uma ou duas palavras no meio da fala de Y são marcadas como X.

**A tensão.** Suavizar demais destrói interjeições reais ("Sim." "Exato.") — que
são justamente o que torna uma transcrição de conversa útil. Suavizar de menos
deixa o ruído.

**O que foi feito.** Uma histerese com critério deliberadamente estrito:

```python
def smooth_word_speakers(speakers, min_run=3):
    if run < min_run and i > 0 and j < len(out) and out[i-1] == out[j]:
        # sequência curta cercada pelo MESMO falante dos dois lados → reescreve
```

Uma sequência de **menos de 3 palavras** só é reescrita se os blocos de ambos os
lados forem **do mesmo falante**. Se os lados discordam, é uma troca de turno
legítima e nada é alterado.

Esse "ambos os lados precisam concordar" é o que separa suavizar de atropelar.

---

## 17. Restrição rígida vs. dica suave

Quando o usuário informa quantas pessoas há, existem duas formas de passar isso
ao pyannote:

```python
min_speakers=N, max_speakers=N   # dica
num_speakers=N                   # restrição
```

Parecem equivalentes. Não são. Em testes lado a lado, a dica suave deixava o
modelo derivar para N+1 falantes fantasma — o agrupamento tratava os limites como
sugestão e criava um cluster extra quando a variação acústica de alguém era alta
(mudança de tom, aproximação do microfone).

```js
if (typeof expectedSpeakers === 'number' && expectedSpeakers >= 2) {
  args.push(`--num-speakers=${expectedSpeakers}`)
}
```

A restrição rígida força exatamente N agrupamentos. Como o usuário normalmente
*sabe* quantas pessoas estavam na sala, essa informação é confiável — e vale mais
que a estimativa do modelo.

Quem não sabe escolhe "Não sei", e a detecção automática age normalmente.

Caso especial: **1 pessoa** não roda diarização alguma. Não faz sentido gastar
minutos determinando quem falou quando só existe um falante:

```js
if (expectedSpeakers === 1) {
  const final = whisperSegments.map(s => ({ ...s, speaker: 'Pessoa 1' }))
}
```

---

## 18. A ordem das operações importa

As duas primeiras heurísticas parecem independentes. Não são:

```python
diar = merge_minor_speakers(diar)   # PRIMEIRO
diar = smooth_diar(diar)            # DEPOIS
```

Se a suavização rodasse antes, a regra do "sanduíche" nunca dispararia para um
blip cujos vizinhos foram rotulados como o **próprio falante fantasma**. Os
vizinhos precisam já estar corrigidos para que o padrão `Y-X-Y` seja
reconhecível.

A sequência completa, em ordem:

1. `merge_minor_speakers` — dissolve fantasmas (nível de turno)
2. `smooth_diar` — funde blips (nível de turno)
3. `assign_speakers_word_level` — sobreposição máxima (nível de palavra)
4. `smooth_word_speakers` — histerese (nível de palavra)
5. Reagrupamento e renomeação para "Pessoa N" na ordem de aparição

De grosso para fino, e cada etapa opera sobre a saída já limpa da anterior.

---

# Parte IV

## 19. Como tudo se encaixa

```
áudio
  │
  ├─ ffmpeg: WAV 16 kHz mono ────────────────────────┐
  │                                                   │
  ├─ silencedetect: mapeia pausas                     │
  ├─ planCutTimes: cortes ~60s alinhados a silêncio   │
  │                                                   │
  ├──────────────────────┬────────────────────────────┤
  ▼                      ▼                            ▼
whisper.cpp          pyannote (community-1)      [em paralelo]
 · VAD                · turnos de fala
 · suppress-nst       · saída exclusiva
 · -mc 64             · restrição rígida de N
 · -bs 5
 · -dtw
 · -fa (se GPU)
  │                      │
  │ tokens               │ turnos
  ▼                      ▼
agrupa em palavras    merge_minor_speakers
rescala p/ timeline   smooth_diar
original (bug VAD)         │
  │                        │
  └────────┬───────────────┘
           ▼
   sobreposição máxima por palavra
           ▼
   histerese (min_run=3)
           ▼
   reagrupa em turnos → "Pessoa N"
```

**Por qualidade da transcrição:** VAD e `suppress-nst` matam a alucinação em
silêncio; `-mc 64` contém loops de repetição; cortes em silêncio eliminam
palavras fatiadas; `large-v3` e beam 5 dão a base.

**Por velocidade:** whisper e pyannote em paralelo (o maior ganho); processos e
threads equilibrados; GPU por Vulkan e Metal; VAD reduz o que precisa ser
decodificado; três modos de modelo.

**Por qualidade da diarização:** modelo community-1; timestamps por DTW; correção
do desalinhamento do VAD; remoção de fantasmas; fusão de blips; atribuição por
palavra; histerese estrita; restrição rígida de contagem.

E as camadas se reforçam. O VAD melhora a transcrição *e* acelera *e* protege a
diarização de texto fantasma. O DTW melhora os timestamps, que são o alicerce da
atribuição. Os cortes em silêncio protegem palavras *e* mantêm o paralelismo.

---

## 20. Como verifiquei

**Testes unitários das funções puras.** O planejamento de cortes e o
agrupamento/rescalonamento de tokens foram extraídos e testados isoladamente:
cortes caindo dentro de silêncios reais, retorno ao alvo exato quando não há
pausa na janela, áudio curto gerando zero cortes, palavras permanecendo dentro do
intervalo do segmento após o rescalonamento, e monotonicidade dos tempos.

**Teste de ponta a ponta com áudio real.** Gerei um áudio em português com duas
vozes distintas e silêncios inseridos entre as falas, e rodei o pipeline com o
binário de verdade. *Medido:* os cortes caíram dentro de silêncios detectados, e
o modo Rápido transcreveu um bloco de 27 segundos em 8,2 segundos, com texto
correto e offsets absolutos corretos.

**Testes da lógica de diarização.** A seleção da saída exclusiva do pyannote foi
testada contra objetos simulando as duas gerações (4.x e 3.x), incluindo o caso
de saída exclusiva vazia. A fusão de blips foi verificada num caso construído.

**Teste da detecção de erro de autenticação.** Sete casos, incluindo os
negativos (falha de ffmpeg, whisper travado, download incompleto) que **não**
devem oferecer a troca de token.

**O que não está medido.** Não há um conjunto de avaliação rotulado próprio, com
WER e DER medidos sobre áudio real anotado. As comparações entre modelos citadas
como *publicadas* vêm dos benchmarks dos projetos originais, não de medição
local. Um conjunto próprio de reuniões em português, com transcrição e
atribuição de referência, é o próximo passo natural para transformar as
heurísticas ajustadas por observação (limiares de 5 s, 4%, 0,5 s, 3 palavras) em
valores calibrados por dado.

---

**Autor:** Kaique Oliveira · **Licença:** MIT
Construído sobre [whisper.cpp](https://github.com/ggml-org/whisper.cpp) e
[pyannote.audio](https://github.com/pyannote/pyannote-audio).
