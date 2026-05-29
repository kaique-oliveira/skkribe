# Contribuindo

Obrigado pelo interesse! O Skkribe é MIT — sinta-se livre pra fazer fork,
estudar, modificar e mandar melhorias.

---

## Preparar o ambiente

Siga o guia de build da sua plataforma pra instalar os pré-requisitos:

- [build-macos.md](build-macos.md)
- [build-windows.md](build-windows.md)
- [build-linux.md](build-linux.md)

Depois:

```bash
git clone https://github.com/kaique-oliveira/skkribe.git
cd skkribe
pnpm install
pnpm install --dir src/renderer
pnpm run setup:whisper
pnpm run dev          # hot reload do renderer + Electron
```

Na primeira `pnpm run dev` o app pede seu token HuggingFace e baixa os modelos
(igual ao app final). Isso acontece uma vez.

---

## Estrutura do código

Leia [ARCHITECTURE.md](ARCHITECTURE.md) primeiro — explica a separação
main/renderer, a pipeline e as decisões de design.

Resumo de onde mexer:

| Quero mudar… | Vá em |
|---|---|
| A interface / telas | `src/renderer/src/views/` |
| Cores, tipografia, animações | `src/renderer/tailwind.config.js` + `components/` |
| A pipeline (ffmpeg/whisper/pyannote) | `src/main/index.js` |
| Algoritmo de diarização | `resources/python/diarize.py` |
| O setup do primeiro uso | `src/main/runtime-setup.js` |
| Como compila o whisper.cpp | `scripts/setup-whisper.js` |

---

## Antes de abrir um PR

- **Renderer compila?** `pnpm --prefix src/renderer run build`
- **Sintaxe do main OK?** `node --check src/main/index.js` (e os outros arquivos
  que você tocou)
- **Testou o fluxo de verdade?** Rode `pnpm run dev` e transcreva um áudio curto
  de ponta a ponta.
- Se mexeu na pipeline de diarização, teste com áudios de **1, 2 e 3+ pessoas**.

---

## Padrões

- **Idioma da UI:** português (pt-BR). Comentários de código em inglês são ok.
- **Commits:** mensagens descritivas explicando o *porquê*, não só o *o quê*.
- **Sem dependências pesadas novas** sem discussão — o objetivo é manter o
  instalador enxuto.
- **Não comite** modelos, venv, binários ou tokens (já estão no `.gitignore`).

---

## Ideias bem-vindas

- Acelerar a diarização na CPU (Windows/Linux)
- Suporte a mais idiomas de transcrição (hoje fixo em `pt`)
- Exportar em outros formatos (SRT, VTT, .txt)
- Builds assinados (code signing) pra Mac e Windows
- Testes automatizados da pipeline

Abra uma [issue](https://github.com/kaique-oliveira/skkribe/issues) pra discutir
antes de investir tempo em algo grande.
