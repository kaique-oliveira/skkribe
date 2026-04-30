# Skribe — Melhorias de Desempenho e Velocidade

Histórico completo de todas as otimizações implementadas no pipeline de transcrição do Skribe.

---

## 1. Chunking de Áudio (Divisão em Blocos)

**Problema:** O whisper.cpp processava o áudio inteiro de uma vez, o que bloqueava completamente a CPU por 30–40 minutos em gravações longas.

**Solução:** O áudio é dividido em blocos de 60 segundos antes de ser enviado ao whisper.

- ffmpeg segmenta o WAV completo usando `-f segment -segment_time 60`
- Cada bloco é um arquivo WAV independente e válido
- O progresso passa de "tudo ou nada" para atualizações a cada bloco concluído

**Ganho estimado:** permite paralelismo real — sem chunking, paralelismo é impossível.

---

## 2. Processamento Paralelo dos Chunks

**Problema:** Mesmo com chunking, processar os blocos em série não aproveitava os múltiplos núcleos do Apple Silicon.

**Solução:** Pool de workers com concorrência limitada (`transcribeChunksParallel`).

- Até `Math.floor(cpus / 2)` processos whisper simultâneos (máximo 6)
- Cada worker recebe uma fatia proporcional das threads disponíveis
- A ordem dos resultados é preservada independentemente da ordem de conclusão

**Ganho estimado:** 2–4× mais rápido em M1/M2/M3 com 8+ núcleos.

---

## 3. Modelos Quantizados (q5_1 / q5_0)

**Problema:** Os modelos completos do whisper.cpp (`.bin` sem quantização) são grandes e lentos — o `small` completo tem ~488 MB e é 2–3× mais lento que a versão quantizada.

**Solução:** Download e uso preferencial de modelos quantizados.

| Modelo | Completo | Quantizado (q5_1) | Redução |
|--------|----------|-------------------|---------|
| tiny   | ~75 MB   | ~32 MB            | −57%    |
| base   | ~148 MB  | ~60 MB            | −59%    |
| small  | ~488 MB  | ~190 MB           | −61%    |
| medium | ~1.5 GB  | ~539 MB (q5_0)    | −64%    |

- O `index.js` tenta modelos na ordem: `q5_1` → `q5_0` → `q8_0` → `.bin` completo
- O script `download-model.js` baixa automaticamente a melhor quantização disponível para cada modelo

**Ganho estimado:** 2–4× mais rápido com qualidade praticamente idêntica ao ouvido humano.

---

## 4. GPU Apple Silicon via Metal

**Problema:** O whisper.cpp rodava apenas em CPU por padrão.

**Solução:** O binário é compilado com `-DWHISPER_METAL=ON`, habilitando aceleração via Metal GPU no Apple Silicon. O pyannote também detecta e usa MPS automaticamente:

```python
if torch.backends.mps.is_available():
    pipeline = pipeline.to(torch.device("mps"))
```

**Ganho estimado:** 3–10× mais rápido dependendo do modelo e duração do áudio.

---

## 5. Threads Configuráveis por Worker

**Problema:** O whisper usava um número fixo de threads, sem considerar quantos workers paralelos estavam rodando ao mesmo tempo.

**Solução:** Cada worker paralelo recebe `Math.max(1, Math.floor(threads / min(maxWorkers, chunks.length)))` threads — dividindo os núcleos disponíveis igualmente entre os processos ativos.

**Ganho:** Evita contention de CPU entre workers paralelos, maximizando throughput total.

---

## 6. Correção do Bug de Chunk Corrompido (WAV PCM)

**Problema:** O ffmpeg com `-c copy` não re-encodava os segmentos WAV PCM — os chunks resultantes tinham amostras corrompidas no início, causando `whisper chunk N falhou (código 3)`.

**Causa raiz:** WAV PCM não tem keyframes. O `-c copy` corta no meio de uma amostra, gerando um arquivo inválido.

**Solução:** Substituído `-c copy` por `-ar 16000 -ac 1 -c:a pcm_s16le` no comando de segmentação. Cada chunk é re-encodado corretamente.

**Impacto:** Pipeline passa a funcionar do início ao fim sem falhas intermediárias.

---

## 7. Validação de Integridade do Modelo

**Problema:** Downloads corrompidos ou incompletos geravam arquivos de 0 bytes que o whisper aceitava sem erro imediato mas falhavam com `invalid model data (bad magic)` durante a transcrição.

**Solução implementada em dois pontos:**

- **`download-model.js`**: verifica se o arquivo já existente tem menos de 1 MB — se sim, deleta e baixa de novo
- **`index.js`**: define `MIN_MODEL_SIZE = 10 MB` e ignora qualquer modelo abaixo desse tamanho ao selecionar qual usar

**Impacto:** Elimina falhas silenciosas por modelo corrompido.

---

## 8. Download Confiável com Redirects

**Problema:** O HuggingFace redireciona para CDNs externos (múltiplos 301/302/307). O código original fechava o `WriteStream` a cada redirect, corrompendo o download e travando em 0%.

**Solução:** O `WriteStream` é aberto uma única vez antes de qualquer requisição HTTP e nunca é fechado entre redirects. Cada redirect apenas faz uma nova requisição para a `Location` recebida, reusando o mesmo stream de destino. Suporta URLs `http://` e `https://` dinamicamente.

**Impacto:** Downloads de modelos funcionam de forma confiável mesmo com cadeias de 5+ redirects.

---

## 9. Pipeline Unificado (sem modo fallback)

**Problema:** O app tinha dois modos: "com diarização" e "sem diarização" (texto puro). O modo fallback desperdiçava o processamento do whisper e ainda exibia uma UI incompleta.

**Solução:** A diarização é obrigatória. Se não estiver configurada, o app exibe a tela de setup antes de aceitar qualquer arquivo. Não existe modo de transcrição sem identificação de falantes.

**Impacto de desempenho:** Elimina processamento duplo (whisper sem diarização + nova chamada com diarização). O pipeline roda uma única vez, sempre completo.

---

## 10. Seleção Automática do Melhor Modelo

**Problema:** O usuário precisava saber manualmente qual modelo baixar e configurar.

**Solução:** O `index.js` varre o diretório de modelos e seleciona automaticamente o melhor disponível para o modelo configurado, priorizando versões quantizadas. O `download-model.js` também resolve a melhor quantização disponível para cada modelo automaticamente via a tabela `BEST_QUANT`.

**Impacto:** O app sempre usa a versão mais rápida disponível sem intervenção manual.

---

## Resumo do Ganho Total

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Tempo típico (60 min de áudio) | ~40 minutos | ~5–8 minutos |
| Uso de CPU | 1 core, 100% | todos os cores, paralelo |
| GPU Apple Silicon | não utilizada | Metal (whisper + MPS pyannote) |
| Tamanho do modelo em disco | 488 MB (small completo) | ~190 MB (small q5_1) |
| Falhas por chunk corrompido | frequentes | eliminadas |
| Falhas por modelo inválido | possível | detectadas e tratadas |
| Downloads travados | possível | tratados com redirect chain |
