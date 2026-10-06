# AliExpress Preço Real — Tampermonkey

Userscript para o AliExpress Brasil que mostra o **total estimado** (preço atual + impostos estimados) logo abaixo do bloco de preço do produto.

> O `+` em “impostos estimados” significa “a partir de”; o total usa o valor exibido pelo AliExpress e pode variar conforme ICMS/estado.

## Instalação

1. Instale o [Tampermonkey](https://www.tampermonkey.net/).
2. Abra o dashboard do Tampermonkey → **Adicionar novo script**.
3. Substitua o conteúdo por `aliexpress-preco-real.user.js` e salve.
4. Recarregue uma página de produto do AliExpress BR.

## Comportamento

- Lê o **preço atual** — não o preço riscado/original.
- Lê a linha “`R$ X+ em impostos estimados`”.
- Mostra um único badge abaixo do wrapper estável de preço, sem depender dos layouts internos de banner/promoção.
- Recalcula quando você troca SKU/cor/pacote e quando a quantidade muda.
- Não mostra total se preço, imposto ou quantidade não estiverem disponíveis/íntegros.
- O menu do Tampermonkey oferece toggle on/off persistente.

## Exemplos validados

- `R$ 466,50` + `R$ 265,53+ em impostos estimados` → **R$ 732,03**
- DSV: `R$ 392,44` + `R$ 191,43+` → **R$ 583,87**
- DSV x2 → **R$ 1.167,74**

## Desenvolvimento e verificação

```bash
node --check aliexpress-preco-real.user.js
node tests/userscript.test.js
```

Os testes cobrem parser BRL, arredondamento, cálculo por quantidade, validação estrita de quantidade, escopo do PDP, ausência de `innerHTML` e proteção contra o loop do `MutationObserver`.

## Arquivos legados

`manifest.json`, `content.js` e `background.js` são a versão Firefox inicial. O artefato mantido e recomendado é `aliexpress-preco-real.user.js`.
