# AliExpress Preço Real — Tampermonkey

Userscript para o AliExpress Brasil que mostra o **total estimado** (preço atual + impostos estimados) logo abaixo do bloco de preço do produto.

> O `+` em “impostos estimados” significa “a partir de”; o total usa o valor exibido pelo AliExpress e pode variar conforme ICMS/estado.

## Instalação (1 clique)

Com o Tampermonkey instalado, abra o link direto do script — ele detecta e abre a página de instalação automaticamente:

**[Clique aqui para instalar](https://github.com/ericksantos12/aliexpress-preco-real/raw/master/aliexpress-preco-real.user.js)**

Alternativa manual: dashboard do Tampermonkey → **Adicionar novo script** → colar o conteúdo de `aliexpress-preco-real.user.js` → salvar → recarregar uma página de produto do AliExpress BR.

## Comportamento

- Lê o **preço atual** — não o preço riscado/original.
- Lê a linha “`R$ X+ em impostos estimados`”.
- Mostra um único badge abaixo do wrapper estável de preço, sem depender dos layouts internos de banner/promoção.
- Recalcula quando você troca SKU/cor/pacote e quando a quantidade muda.
- Não mostra total se preço, imposto ou quantidade não estiverem disponíveis/íntegros.
- O menu do Tampermonkey oferece toggle on/off persistente.

## Como foi feito

Criado com [Hermes Agent](https://hermes-agent.nousresearch.com) (Hermes, da Nous Research): desenvolvimento iterativo guiado com scraping real do AliExpress via MCP browser stealth, seguido de três revisões de código independentes (fail-closed) e testes automatizados, com implementação final delegada ao [OpenAI Codex](https://openai.com/codex) como assistente de codificação.

## Desenvolvimento e verificação

```bash
node --check aliexpress-preco-real.user.js
node tests/userscript.test.js
```

Os testes cobrem parser BRL, arredondamento, cálculo por quantidade, validação estrita de quantidade, escopo do PDP, ausência de `innerHTML` e proteção contra o loop do `MutationObserver`.

