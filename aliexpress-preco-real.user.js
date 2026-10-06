// ==UserScript==
// @name         AliExpress Preço Real
// @namespace    erick.hermes
// @version      1.3.0
// @description  TOTAL real (preço + impostos estimados) do lado do preço no AliExpress BR, atualizado conforme SKU selecionado e quantidade. Seletores mapeados por scraping real.
// @author       Erick Santos (via Hermes)
// @match        https://pt.aliexpress.com/*
// @match        https://*.aliexpress.com/item/*
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

  function formatBRL(v) {
    return "R$" + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function parseBRL(text) {
    const m = (text || "").match(/R\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})/);
    return m ? parseFloat(m[1].replace(/\./g, "").replace(",", ".")) : null;
  }

  function textOf(el) { return el ? (el.textContent || "").trim() : ""; }

  function getTaxText() {
    const span = document.querySelector('[class*="vat-installment--item"]');
    if (span && /impostos estimados/i.test(textOf(span))) return textOf(span);
    for (const el of document.querySelectorAll("span, div")) {
      if (el.children.length === 0 && /impostos estimados/i.test(textOf(el))) return textOf(el);
    }
    return "";
  }

  function getQuantity() {
    const input = document.querySelector("input.comet-v2-input-number-input");
    if (!input) return null;
    const n = parseInt(input.value, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function injectBadge(priceEl, total, qty) {
    const wrap = priceEl.closest('[class*="price-default--defaultPriceWrap"]') || priceEl.parentElement;
    if (!wrap) return;
    let badge = wrap.querySelector("." + BADGE_CLASS);
    const label = qty > 1 ? "TOTAL c/ impostos (x" + qty + "): " : "TOTAL c/ impostos: ";
    if (!badge) {
      badge = document.createElement("span");
      badge.className = BADGE_CLASS;
      priceEl.insertAdjacentElement("afterend", badge);
    }
    badge.textContent = label + formatBRL(total);
    wrap.setAttribute(BADGE_MARK, "1");
  }

  function refreshBadge() {
    if (!enabled) return;
    const taxValue = parseBRL(getTaxText());
    if (taxValue == null || taxValue <= 0) {
      removeAllBadges(true);
      return;
    }
    const qty = getQuantity() || 1;
    const priceEls = document.querySelectorAll('[class*="price-default--current"]');
    if (!priceEls.length) return;
    priceEls.forEach((priceEl) => {
      const unit = parseBRL(textOf(priceEl));
      if (unit == null || unit <= 0) return;
      const total = Math.round((unit + taxValue) * qty * 100) / 100;
      injectBadge(priceEl, total, qty);
    });
  }

  function removeAllBadges(clearMark) {
    document.querySelectorAll("." + BADGE_CLASS).forEach((b) => {
      const wrap = b.closest('[class*="price-default--defaultPriceWrap"]');
      b.remove();
      if (wrap && clearMark) wrap.removeAttribute(BADGE_MARK);
    });
  }

  function tick() {
    if (!enabled) return;
    try { refreshBadge(); } catch (e) { console.warn("[aexpr]", e); }
  }

  // observer: recalcula quando a página muda (troca de SKU, quantidade, re-render).
  //Ignora mutações geradas pelo próprio badge pra não virar loop infinito.
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.target && m.target.closest && m.target.closest("." + BADGE_CLASS)) continue;
      if (m.addedNodes && m.addedNodes.length === 1) {
        const n = m.addedNodes[0];
        if (n.classList && n.classList.contains(BADGE_CLASS)) continue;
      }
      requestAnimationFrame(tick);
      return;
    }
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });

  tick();

  GM_registerMenuCommand(
    enabled ? "🔇 AliExpress Preço Real: OFF" : "✅ AliExpress Preço Real: ON",
    () => {
      enabled = !enabled;
      GM_setValue(ENABLED_KEY, enabled);
      if (enabled) tick(); else removeAllBadges(true);
    }
  );
})();
