// ==UserScript==
// @name         AliExpress Preço Real
// @namespace    erick.hermes
// @version      1.2.0
// @description  Mostra o TOTAL real (preço do produto + impostos estimados) do lado do preço, na página de produto do AliExpress BR. Seletores mapeados por scraping real.
// @author       Erick Santos (via Hermes)
// @match        https://pt.aliexpress.com/*
// @match        https://*.aliexpress.com/item/*
// @match        https://aliexpress.com/item/*
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  const BADGE_CLASS = "aexpr-total-badge";
  const BADGE_MARK = "data-aexpr-done";
  const ENABLED_KEY = "aexpr_enabled";
  let enabled = GM_getValue(ENABLED_KEY, true);

  GM_addStyle(`
    .${BADGE_CLASS} {
      display: inline-block;
      margin-left: 8px;
      padding: 2px 8px;
      border-radius: 6px;
      background: #0f172a;
      color: #7dffb2;
      font-weight: 700;
      font-size: 13px;
      line-height: 1.35;
      letter-spacing: .2px;
      vertical-align: middle;
      white-space: nowrap;
      z-index: 9999;
      box-shadow: 0 1px 2px rgba(0,0,0,.3);
    }
  `);

  function formatBRL(value) {
    return "R$" + value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function parseBRL(text) {
    const m = text.match(/R\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})/);
    if (!m) return null;
    return parseFloat(m[1].replace(/\./g, "").replace(",", "."));
  }

  function textOf(el) {
    return el ? (el.textContent || "").trim() : "";
  }

  function injectBadge(priceEl, total) {
    const wrap = priceEl.closest('[class*="price-default--defaultPriceWrap"]') || priceEl.parentElement;
    if (!wrap || wrap.getAttribute(BADGE_MARK) === "1") return;
    wrap.setAttribute(BADGE_MARK, "1");

    const badge = document.createElement("span");
    badge.className = BADGE_CLASS;
    badge.textContent = "TOTAL c/ impostos: " + formatBRL(total);
    priceEl.insertAdjacentElement("afterend", badge);
  }

  function processProductPage() {
    // 1) preços principais na página de produto (classe estável mapeada: price-default--current)
    const priceEls = document.querySelectorAll('[class*="price-default--current"]');
    if (!priceEls.length) return false;

    // 2) texto dos impostos: span com classe vat-installment--item
    let taxText = "";
    const taxSpan = document.querySelector('[class*="vat-installment--item"]');
    if (taxSpan) {
      taxText = textOf(taxSpan);
    }
    if (!taxText) {
      // fallback: procurar em todo o DOM (menos comum)
      const allSpans = document.querySelectorAll("span, div");
      for (const el of allSpans) {
        if (el.children.length === 0 && /impostos estimados/i.test(textOf(el))) {
          taxText = textOf(el);
          break;
        }
      }
    }
    if (!taxText) return false;

    const taxValue = parseBRL(taxText);
    if (taxValue == null || taxValue <= 0) return false;

    let processed = 0;
    priceEls.forEach((priceEl) => {
      const mainValue = parseBRL(textOf(priceEl));
      if (mainValue == null || mainValue <= 0) return;
      const total = Math.round((mainValue + taxValue) * 100) / 100;
      injectBadge(priceEl, total);
      processed++;
    });
    return processed > 0;
  }

  function tick() {
    if (!enabled) return;
    try {
      processProductPage();
    } catch (e) {
      console.warn("[aexpr] erro:", e);
    }
  }

  // MutationObserver: SPA re-render, troca de SKU, lazy-load de variações
  const observer = new MutationObserver(() => {
    requestAnimationFrame(tick);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("popstate", tick);

  tick();

  GM_registerMenuCommand(
    enabled ? "🔇 AliExpress Preço Real: OFF" : "✅ AliExpress Preço Real: ON",
    () => {
      enabled = !enabled;
      GM_setValue(ENABLED_KEY, enabled);
      if (!enabled) {
        document.querySelectorAll("." + BADGE_CLASS).forEach((el) => {
          const wrap = el.closest('[class*="price-default--defaultPriceWrap"]');
          el.remove();
          if (wrap) wrap.removeAttribute(BADGE_MARK);
        });
      } else {
        tick();
      }
      location.reload();
    }
  );
})();
