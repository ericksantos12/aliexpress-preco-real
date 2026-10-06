# AliExpress Preço Real (Firefox)

Extensão que mostra o **preço total real** (produto + impostos estimados) em cada card e página de produto do AliExpress BR.

O AliExpress sempre exibe o valor do produto em destaque e, em letra pequena, a linha "Compra internacional, R$X,XX+ em impostos estimados." — o que você paga de verdade é a soma. Este badge calcula e mostra essa soma automaticamente:

```
TOTAL c/ impostos: R$723,15
```

## Instalação (modo desenvolvedor)

1. Abra o Firefox e digite `about:debugging#/runtime/this-firefox`
2. Clique em **"Carregar Add-on Temporário…"**
3. Selecione o arquivo `manifest.json` desta pasta
4. Pronto — abra qualquer produto do AliExpress BR

> Modo temporário: a extensão some ao reiniciar o Firefox. Para instalação permanente, compacte os arquivos em `.zip` e assine via [addons.mozilla.org](https://addons.mozilla.org/developers/) (ou use a versão de desenvolvedor do Firefox com `xpinstall.signatures.required=false` em `about:config`).

## Uso

- O badge aparece automaticamente sob cada bloco de preço que tenha impostos estimados
- **Ligar/desligar**: clique no ícone da extensão na barra de ferramentas (estado persiste)

## Como funciona

- **Parser BRL**: reconhece `R$462,07`, `R$ 1.331,59` e a âncora distintiva `R$261,08+ em impostos estimados` (o `+` antes de "em impostos estimados" é o delimitador — evita confundir com preços comuns)
- **Seletores sem classes**: não depende dos classnames hashados do AliExpress (mudam toda semana); usa texto e estrutura de DOM
- **MutationObserver**: cobre lazy load, re-render e navegação SPA sem quebrar o layout

## Caso de teste (do screenshot real)

Card com:
- Preço principal: `R$462,07`
- Impostos: `Compra internacional, R$261,08+ em impostos estimados.`

Resultado esperado — badge injetado:
- **TOTAL c/ impostos: R$723,15** (462,07 + 261,08)

Nota: o `+` no valor dos impostos significa "a partir de" (o valor final pode variar por estado/ICMS). O badge mostra a soma com o valor exibido.
