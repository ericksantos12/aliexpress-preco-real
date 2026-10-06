/**
 * AliExpress Preço Real — content script
 *
 * Detecta blocos de preço no AliExpress BR e injeta um badge "TOTAL" com
 * preço + impostos estimados logo abaixo de cada bloco.
 *
 * Formatos tratados (pt-BR):
 *   Preço:      "R$462,07" / "R$ 1.331,59"
 *   Impostos:   "Compra internacional, R$261,08+ em impostos estimados."
 *               (o "+" é a âncora distintiva da frase de impostos)
 *
 * Robustez:
 *   - Sem dependência de classes hashadas do AliExpress (mudam toda semana).
 *   - MutationObserver pega lazy load, re-render e navegação SPA.
 *   - Badge marcado com data-atributo para nunca duplicar.
 *   - Guard de performance: scan com throttle e só em TextNodes relevantes.
 */

(() => {
  "use strict";

  const BADGE_CLASS = "aexpr-total-badge";
  const BADGE_MARK = "data-aexpr-done";
  const ENABLED_KEY = "aexpr_enabled";

  let enabled = true;

  /* ---------- toggle (browser_action -> storage) ---------- */

  const applyEnabled = (v) => {
    enabled = v;
    if (!enabled) removeAllBadges();
    else scanWholePage();
  };

  if (typeof browser !== "undefined" && browser.storage) {
    browser.storage.local
      .get(ENABLED_KEY)
      .then((r) => {
        if (r[ENABLED_KEY] === false) applyEnabled(false);
      })
      .catch(() => {});
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && ENABLED_KEY in changes) {
        applyEnabled(changes[ENABLED_KEY].newValue !== false);
      }
    });
  }

  /* ---------- CSS ---------- */

  const style = document.createElement("style");
  style.textContent = `
    .${BADGE_CLASS} {
      display: inline-flex;
      align-items: baseline;
      gap: 4px;
      margin-top: 3px;
      padding: 2px 8px;
      border-radius: 6px;
      background: #0f172a;
      color: #7dffb2;
      font-weight: 700;
      font-size: 13px;
      line-height: 1.35;
      width: fit-content;
      letter-spacing: .2px;
      z-index: 9;
    }
    .${BADGE_CLASS} .aexpr-label {
      font-weight: 500;
      font-size: 11px;
      color: #cbd5e1;
    }
  `;
  document.head.appendChild(style);

  /* ---------- parsing ---------- */

  // "R$462,07" | "R$ 1.331,59" -> 462.07 | 1331.59
  const RE_PRICE = /R\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})/;

  // impostos: exige o "+" como âncora — "R$261,08+ em impostos estimados"
  const RE_TAX = /R\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})\+\s*em\s+impostos\s+estimados/i;

  const toNumber = (brl) =>
    brl ? parseFloat(brl.replace(/\./g, "").replace(",", ".")) : null;

  const formatBRL = (n) =>
    "R$" +
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* ---------- descoberta de blocos ---------- */

  /**
   * Um "bloco de preço" é o menor ancestral comum entre:
   *   - um elemento cujo texto começa com um preço forte (preço principal)
   *   - o elemento dos impostos estimados
   * Estratégia: acha o elemento dos impostos; sobe até o ancestral que
   * também contenha um preço principal; injeta o badge nele.
   */
  function findTaxNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(text) {
          if (!text.nodeValue || text.nodeValue.length > 400) return NodeFilter.FILTER_REJECT;
          if (RE_TAX.test(text.nodeValue)) return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        },
      }
    );
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  function mainPriceIn(el, taxValue) {
    // procura um preço cujo valor != imposto, priorizando o maior/primeiro
    const prices = [];
    const walker = document.createTreeWalker(
      el,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(text) {
          if (!text.nodeValue) return NodeFilter.FILTER_REJECT;
          const m = RE_PRICE.exec(text.nodeValue);
          if (m && toNumber(m[1]) !== taxValue) return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        },
      }
    );
    let n;
    while ((n = walker.nextNode())) {
      const m = RE_PRICE.exec(n.nodeValue);
      if (m) prices.push({ node: n, value: toNumber(m[1]), text: m[1] });
    }
    if (!prices.length) return null;
    // preço principal = maior valor (o riscado costuma ser maior, mas o
    // principal está sempre em fonte maior que os impostos; entre os
    // candidatos pegamos o maior que não seja o imposto)
    prices.sort((a, b) => b.value - a.value);
    return prices[0];
  }

  function blockFor(taxTextNode) {
    // sobe até 6 níveis buscando um ancestral que contenha um preço principal
    let el = taxTextNode.parentElement;
    for (let depth = 0; el && depth < 6; depth++, el = el.parentElement) {
      const taxM = RE_TAX.exec(taxTextNode.nodeValue);
      const taxValue = toNumber(taxM && taxM[1]);
      const main = mainPriceIn(el, taxValue);
      if (main && el !== document.body) return { block: el, main, taxValue };
    }
    return null;
  }

  /* ---------- badge ---------- */

  function badgeAlready(block) {
    return block.querySelector(`.${BADGE_CLASS}`) !== null;
  }

  function injectBadge(block, mainValue, taxValue) {
    if (badgeAlready(block)) return;

    const total = Math.round((mainValue + taxValue) * 100) / 100;
    const badge = document.createElement("div");
    badge.className = BADGE_CLASS;
    badge.setAttribute(BADGE_MARK, "1");
    // valores formatados aqui não vêm de input externo (parse our own regex),
    // mas usamos textContent por hygiene
    const label = document.createElement("span");
    label.className = "aexpr-label";
    label.textContent = "TOTAL c/ impostos:";
    const value = document.createElement("span");
    value.textContent = formatBRL(total);
    badge.appendChild(label);
    badge.appendChild(value);
    block.appendChild(badge);
  }

  /* ---------- scans ---------- */

  function processTaxNode(taxTextNode) {
    const found = blockFor(taxTextNode);
    if (!found) return;
    if (found.block.getAttribute(BADGE_MARK) === "1" || badgeAlready(found.block)) return;
    injectBadge(found.block, found.main.value, found.taxValue);
  }

  function scanWholePage() {
    if (!enabled) return;
    const taxNodes = findTaxNodes(document.body);
    for (const t of taxNodes) {
      // ignora se o texto já está dentro de um badge
      if (t.parentElement && t.parentElement.closest(`.${BADGE_CLASS}`)) continue;
      processTaxNode(t);
    }
  }

  function removeAllBadges() {
    document.querySelectorAll(`.${BADGE_CLASS}`).forEach((b) => b.remove());
  }

  /* ---------- observers ---------- */

  let scheduled = false;
  const scheduleScan = () => {
    if (scheduled) return;
    scheduled = true;
    requestIdleCallback
      ? requestIdleCallback(() => { scheduled = false; scanWholePage(); }, { timeout: 800 })
      : setTimeout(() => { scheduled = false; scanWholePage(); }, 300);
  };

  const mo = new MutationObserver((muts) => {
    if (!enabled) return;
    // barato: só reagenda se algo textual mudou
    for (const m of muts) {
      if (m.type === "childList" || m.type === "characterData") {
        scheduleScan();
        return;
      }
    }
  });

  const startObserver = () => {
    mo.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  };

  // SPA: reescaneia após navegações
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scheduleScan();
    }
  }, 1200);

  scanWholePage();
  startObserver();
})();
