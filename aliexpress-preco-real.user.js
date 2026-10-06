// ==UserScript==
// @name         AliExpress Preço Real
// @namespace    erick.hermes
// @version      1.1.0
// @description  Mostra o TOTAL real (preço do produto + impostos estimados) sob cada bloco de preço do AliExpress BR. Toggle on/off no menu do Tampermonkey.
// @author       Erick Santos (Hermes)
// @match        *://*.aliexpress.com/*
// @match        *://pt.aliexpress.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";

  const BADGE_CLASS = "aexpr-total-badge";
  const BADGE_MARK = "data-aexpr-done";
  const KEY = "aexpr_enabled";

  let enabled = GM_getValue(KEY, true);

  /* ---------- menu de toggle do Tampermonkey ---------- */

  GM_registerMenuCommand(
    (enabled ? "🔇 Desligar" : "✅ Ligar") + " AliExpress Preço Real",
    () => {
      enabled = !enabled;
      GM_setValue(KEY, enabled);
      if (!enabled) removeAllBadges();
      else scanWholePage();
      alert("AliExpress Preço Real: " + (enabled ? "LIGADO" : "DESLIGADO"));
    }
  );

  /* ---------- CSS ---------- */

  const style = document.createElement("style");
  style.textContent = `
    .${BADGE_CLASS} {
      display: inline-flex;
      align-items: baseline;
      gap: 4px;
      margin-left: 8px;
      padding: 2px 8px;
      border-radius: 6px;
      background: #0f172a;
      color: #7dffb2;
      font-weight: 700;
      font-size: 13px;
      line-height: 1.35;
      width: fit-content;
      letter-spacing: .2px;
      vertical-align: middle;
      white-space: nowrap;
      z-index: 9999;
    }
    .${BADGE_CLASS} .aexpr-label {
      font-weight: 500;
      font-size: 11px;
      color: #cbd5e1;
    }
  `;
  document.head.appendChild(style);

  /* ---------- parsing (mesma lógica validada da extensão) ---------- */

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
    const prices = [];
    const walker = document.createTreeWalker(
      el,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(text) {
          if (!text.nodeValue) return NodeFilter.FILTER_REJECT;
          // pula texto riscado: preço antigo (line-through) não é o preço atual
          const parent = text.parentElement;
          if (parent) {
            const cs = getComputedStyle(parent);
            if (cs.textDecorationLine.includes("line-through")) return NodeFilter.FILTER_SKIP;
          }
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
    // heurística: o preço principal é o MAIOR valor do bloco após remover
    // (a) o riscado (filtrado acima pelo line-through) e (b) os impostos.
    // Valores menores sobrando (parcelas "51,03 x 12", cupom "OFF em 370,00")
    // perdem pro maior — o preço cheio sempre domina dentro do bloco de preço.
    prices.sort((a, b) => b.value - a.value);
    return prices[0];
  }

  function blockFor(taxTextNode) {
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

  function injectBadge(block, mainValue, taxValue, priceNode) {
    if (badgeAlready(block)) return;

    const total = Math.round((mainValue + taxValue) * 100) / 100;
    const badge = document.createElement("span");
    badge.className = BADGE_CLASS;
    badge.setAttribute(BADGE_MARK, "1");
    // textContent por hygiene (sem innerHTML com dados externos)
    const label = document.createElement("span");
    label.className = "aexpr-label";
    label.textContent = "TOTAL c/ impostos:";
    const value = document.createElement("span");
    value.textContent = formatBRL(total);
    badge.appendChild(label);
    badge.appendChild(value);

    // injeta DO LADO do preço principal (inline), não embaixo do bloco
    const anchor = priceNode && priceNode.parentElement;
    if (anchor && anchor.parentElement) {
      anchor.insertAdjacentElement("afterend", badge);
    } else {
      block.appendChild(badge);
    }
  }

  /* ---------- scans ---------- */

  function processTaxNode(taxTextNode) {
    const found = blockFor(taxTextNode);
    if (!found) return;
    if (found.block.getAttribute(BADGE_MARK) === "1" || badgeAlready(found.block)) return;
    injectBadge(found.block, found.main.value, found.taxValue, found.main.node);
  }

  function scanWholePage() {
    if (!enabled) return;
    const taxNodes = findTaxNodes(document.body);
    for (const t of taxNodes) {
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
    const run = () => { scheduled = false; scanWholePage(); };
    if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 800 });
    else setTimeout(run, 300);
  };

  const mo = new MutationObserver((muts) => {
    if (!enabled) return;
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
