/**
 * AliExpress Preço Real — background (MV2 event page)
 * Recebe cliques no browser_action e alterna o estado on/off no storage.
 */

const ENABLED_KEY = "aexpr_enabled";

browser.browserAction.onClicked.addListener(async () => {
  const current = await browser.storage.local.get(ENABLED_KEY);
  const newValue = current[ENABLED_KEY] === false;
  await browser.storage.local.set({ [ENABLED_KEY]: newValue });
  browser.browserAction.setTitle({
    title: newValue
      ? "AliExpress Preço Real: LIGADO (clique p/ desligar)"
      : "AliExpress Preço Real: DESLIGADO (clique p/ ligar)",
  });
});

// reflete o estado no título ao iniciar
browser.storage.local.get(ENABLED_KEY).then((r) => {
  if (r[ENABLED_KEY] === false) {
    browser.browserAction.setTitle({ title: "AliExpress Preço Real: DESLIGADO (clique p/ ligar)" });
  }
});
