#!/usr/bin/env node
"use strict";

const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const sourcePath = require("path").join(__dirname, "..", "aliexpress-preco-real.user.js");
const source = fs.readFileSync(sourcePath, "utf8");

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

function extractFunction(name, endName) {
  const start = source.indexOf(`  function ${name}`);
  const end = source.indexOf(`  function ${endName}`, start);
  assert.notStrictEqual(start, -1, `${name} não encontrado`);
  assert.notStrictEqual(end, -1, `${endName} não encontrado`);
  return source.slice(start, end);
}

const parsingCode = [
  "const PRICE_RE = /R\\$\\s?(\\d{1,3}(?:\\.\\d{3})*,\\d{2})/;",
  "const TAX_RE = /R\\$\\s?(\\d{1,3}(?:\\.\\d{3})*,\\d{2})\\+?\\s*em\\s+impostos\\s+estimados/i;",
  extractFunction("parseBRL", "formatBRL"),
  extractFunction("formatBRL", "getTaxValue"),
].join("\n");

const context = {};
vm.createContext(context);
vm.runInContext(`${parsingCode}; this.parseBRL = parseBRL; this.formatBRL = formatBRL;`, context);

const quantityCode = [
  extractFunction("parseQuantity", "getQuantity"),
].join("\n");
const quantityContext = {};
vm.createContext(quantityContext);
vm.runInContext(`${quantityCode}; this.parseQuantity = parseQuantity;`, quantityContext);

test("quantidade exige inteiro positivo completo", () => {
  assert.strictEqual(quantityContext.parseQuantity("2"), 2);
  assert.strictEqual(quantityContext.parseQuantity(" 12 "), 12);
  assert.strictEqual(quantityContext.parseQuantity("2abc"), null);
  assert.strictEqual(quantityContext.parseQuantity("2.5"), null);
  assert.strictEqual(quantityContext.parseQuantity("0"), null);
  assert.strictEqual(quantityContext.parseQuantity(""), null);
});

test("parser aceita BRL simples", () => {
  assert.strictEqual(context.parseBRL("R$466,50"), 466.5);
});

test("parser aceita separador de milhar", () => {
  assert.strictEqual(context.parseBRL("R$ 1.331,59"), 1331.59);
});

test("parser de imposto exige contexto de impostos", () => {
  assert.strictEqual(
    context.parseBRL("Compra internacional, R$265,53+ em impostos estimados.", /R\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})\+?\s*em\s+impostos\s+estimados/i),
    265.53,
  );
  assert.strictEqual(
    context.parseBRL("R$535,80", /R\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})\+?\s*em\s+impostos\s+estimados/i),
    null,
  );
});

test("total do kit 6pcs está correto", () => {
  assert.strictEqual(context.formatBRL(Math.round((466.5 + 265.53) * 100) / 100), "R$732,03");
});

test("total muda com SKU e quantidade", () => {
  const dsv = Math.round((392.44 + 191.43) * 100) / 100;
  const twoDsv = Math.round(dsv * 2 * 100) / 100;
  assert.strictEqual(context.formatBRL(dsv), "R$583,87");
  assert.strictEqual(context.formatBRL(twoDsv), "R$1.167,74");
});

test("arquitetura escopa o PDP e observa alterações de quantidade", () => {
  assert.match(source, /PRODUCT_SCOPE_SELECTOR/);
  assert.match(source, /price-default--current--/);
  assert.match(source, /document\.addEventListener\("input"/);
  assert.match(source, /getQuantity\(scope\)/);
  assert.match(source, /scope\.closest\("\.pdp-body-top"\)/);
  assert.doesNotMatch(source, /pdp-body-top-left/);
});

test("arquitetura não insere HTML não confiável", () => {
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.match(source, /badge\.textContent/);
});

test("observer ignora inserção e remoção do próprio badge", () => {
  const start = source.indexOf("  function isOwnBadgeNode");
  const end = source.indexOf("  const observer", start);
  assert.notStrictEqual(start, -1, "isOwnBadgeNode não encontrado");
  const observerContext = {
    Node: { ELEMENT_NODE: 1 },
    BADGE_CLASS: "aexpr-total-badge",
  };
  vm.createContext(observerContext);
  vm.runInContext(`${source.slice(start, end)}; this.isOwnBadgeNode = isOwnBadgeNode;`, observerContext);

  const ownBadge = {
    nodeType: 1,
    classList: { contains: (name) => name === "aexpr-total-badge" },
    closest: () => null,
  };
  const childOfBadge = {
    nodeType: 1,
    classList: { contains: () => false },
    closest: (selector) => selector === ".aexpr-total-badge" ? {} : null,
  };
  const productNode = {
    nodeType: 1,
    classList: { contains: () => false },
    closest: () => null,
  };

  assert.strictEqual(observerContext.isOwnBadgeNode(ownBadge), true);
  assert.strictEqual(observerContext.isOwnBadgeNode(childOfBadge), true);
  assert.strictEqual(observerContext.isOwnBadgeNode(productNode), false);
});

if (process.exitCode) process.exit(process.exitCode);
console.log("Todos os testes passaram.");
