// ==UserScript==
// @name         AliExpress Preço Real
// @namespace    erick.hermes
// @version      2.1.0
// @description  Mostra o total estimado (preço + impostos) abaixo do bloco de preço do AliExpress BR, atualizando com SKU e quantidade.
// @author       Erick Santos (via Hermes)
// @match        https://pt.aliexpress.com/item/*
// @match        https://*.aliexpress.com/item/*
// @match        https://aliexpress.com/item/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  "use strict";

  const BADGE_CLASS = "aexpr-total-badge";
  const ENABLED_KEY = "aexpr_enabled";
  const PRODUCT_SCOPE_SELECTOR = ".pdp-info-right, [class*='pdp-info-right']";
  const PRICE_SELECTOR = '[class*="price-default--current--"]';
  const TAX_SELECTOR = '[class*="vat-installment--item"]';
  const HOST_SELECTOR = '[class*="price-default--wrap--"]';
  const QUANTITY_SELECTOR = "input.comet-v2-input-number-input";
  const PRICE_RE = /R\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})/;
  const TAX_RE = /R\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})\+?\s*em\s+impostos\s+estimados/i;

  let enabled = GM_getValue(ENABLED_KEY, true);
  let scheduled = false;

  GM_addStyle(`
    .${BADGE_CLASS} {
      display: block;
      width: fit-content;
      max-width: 100%;
      box-sizing: border-box;
      margin-top: 4px;
      padding: 3px 8px;
      overflow-wrap: anywhere;
      border-radius: 6px;
      background: #0f172a;
      color: #7dffb2;
      font-weight: 700;
      font-size: 13px;
      line-height: 1.35;
      letter-spacing: .2px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, .3);
    }
  `);

  function parseBRL(text, expression = PRICE_RE) {
    const match = (text || "").match(expression);
    if (!match) return null;
    const value = Number.parseFloat(match[1].replace(/\./g, "").replace(",", "."));
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function formatBRL(value) {
    return "R$" + value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function isVisible(element) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function getProductScope() {
    const tax = [...document.querySelectorAll(TAX_SELECTOR)]
      .find((element) => isVisible(element) && parseBRL(element.textContent, TAX_RE) !== null);
    return tax?.closest(PRODUCT_SCOPE_SELECTOR) || null;
  }

  function getTaxValue(scope) {
    const preferred = [...scope.querySelectorAll(TAX_SELECTOR)].find(isVisible);
    const preferredValue = parseBRL(preferred?.textContent, TAX_RE);
    if (preferredValue !== null) return preferredValue;

    // Fallback limitado ao produto: não mistura cards de recomendação com o PDP atual.
    for (const element of scope.querySelectorAll("span, div")) {
      if (element.children.length !== 0) continue;
      const value = parseBRL(element.textContent, TAX_RE);
      if (value !== null) return value;
    }
    return null;
  }

  function parseQuantity(rawValue) {
    const normalized = String(rawValue ?? "").trim();
    if (!/^[1-9]\d*$/.test(normalized)) return null;
    const value = Number(normalized);
    return Number.isSafeInteger(value) ? value : null;
  }

  function getQuantity(scope) {
    // O seletor de quantidade fica na coluna de compra; o ancestral comum é
    // pdp-body-top. Assim não capturamos input oculto de outro produto/card.
    const productTop = scope.closest(".pdp-body-top") || scope;
    const input = [...productTop.querySelectorAll(QUANTITY_SELECTOR)].find(isVisible);
    return input ? parseQuantity(input.value) : null;
  }

  function getCurrentPrice(scope) {
    const prices = [...scope.querySelectorAll(PRICE_SELECTOR)]
      .filter(isVisible)
      .map((element) => ({ element, value: parseBRL(element.textContent) }))
      .filter(({ value }) => value !== null);

    // Se re-render deixar duas cópias visíveis, o principal é o de maior fonte.
    prices.sort((a, b) => Number.parseFloat(getComputedStyle(b.element).fontSize)
      - Number.parseFloat(getComputedStyle(a.element).fontSize));
    return prices[0] || null;
  }

  function getHost(priceElement) {
    return priceElement.closest(HOST_SELECTOR) || priceElement.parentElement;
  }

  function removeBadges(root = document) {
    root.querySelectorAll(`.${BADGE_CLASS}`).forEach((badge) => badge.remove());
  }

  function updateBadge(host, total, quantity) {
    let badge = host.querySelector(`:scope > .${BADGE_CLASS}`);
    host.querySelectorAll(`.${BADGE_CLASS}`).forEach((candidate) => {
      if (candidate !== badge) candidate.remove();
    });

    if (!badge) {
      badge = document.createElement("span");
      badge.className = BADGE_CLASS;
      host.appendChild(badge);
    }

    const quantityLabel = quantity > 1 ? ` (x${quantity})` : "";
    badge.textContent = `TOTAL c/ impostos${quantityLabel}: ${formatBRL(total)}`;
  }

  function refresh() {
    if (!enabled) return;
    // Reconcilia primeiro: SKU/preço temporariamente ausente nunca deixa total obsoleto.
    removeBadges();

    const scope = getProductScope();
    if (!scope) return;
    const quantity = getQuantity(scope);
    if (quantity === null) return;

    const tax = getTaxValue(scope);
    const currentPrice = getCurrentPrice(scope);
    if (tax === null || !currentPrice) return;

    const host = getHost(currentPrice.element);
    if (!host) return;
    const total = Math.round((currentPrice.value + tax) * quantity * 100) / 100;
    updateBadge(host, total, quantity);
  }

  function scheduleRefresh() {
    if (!enabled || scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try {
        refresh();
      } catch (error) {
        console.warn("[AliExpress Preço Real] atualização ignorada:", error);
      }
    });
  }

  function isOwnBadgeNode(node) {
    return node.nodeType === Node.ELEMENT_NODE
      && Boolean(node.classList.contains(BADGE_CLASS) || node.closest(`.${BADGE_CLASS}`));
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const target = mutation.target.nodeType === Node.ELEMENT_NODE
        ? mutation.target
        : mutation.target.parentElement;
      if (target?.closest(`.${BADGE_CLASS}`)) continue;

      // Adição/remoção do nosso próprio badge tem target=host; ignorar as duas
      // impede o refresh de se autoagendar indefinidamente.
      const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
      if (changedNodes.length > 0 && changedNodes.every(isOwnBadgeNode)) continue;

      scheduleRefresh();
      return;
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  // input controlado pode mudar value sem gerar childList/characterData.
  document.addEventListener("input", (event) => {
    if (event.target.matches?.(QUANTITY_SELECTOR)) scheduleRefresh();
  }, true);
  document.addEventListener("change", (event) => {
    if (event.target.matches?.(QUANTITY_SELECTOR)) scheduleRefresh();
  }, true);
  window.addEventListener("popstate", scheduleRefresh);
  window.addEventListener("pageshow", scheduleRefresh);

  GM_registerMenuCommand(
    enabled ? "🔇 AliExpress Preço Real: OFF" : "✅ AliExpress Preço Real: ON",
    () => {
      enabled = !enabled;
      GM_setValue(ENABLED_KEY, enabled);
      if (enabled) refresh();
      else removeBadges();
    },
  );

  refresh();
})();
