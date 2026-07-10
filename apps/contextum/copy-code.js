(() => {
  "use strict";

  const pairBox = document.getElementById("pairBox");
  const pairCode = document.getElementById("pairCode");
  if (!pairBox || !pairCode) return;

  const copyButton = document.createElement("button");
  copyButton.id = "pairCopyButton";
  copyButton.className = "secondary-button";
  copyButton.type = "button";
  copyButton.textContent = "Copiar";
  copyButton.hidden = true;

  const linkButton = document.createElement("button");
  linkButton.id = "pairCopyLinkButton";
  linkButton.className = "secondary-button";
  linkButton.type = "button";
  linkButton.textContent = "Copiar enlace";
  linkButton.hidden = true;

  pairBox.appendChild(copyButton);
  pairBox.appendChild(linkButton);

  const currentCode = () => pairCode.textContent.trim();
  const hasValidCode = () => {
    const code = currentCode();
    return Boolean(code && code !== "—");
  };

  const refreshVisibility = () => {
    const shouldHide = !hasValidCode() || pairBox.hidden;
    if (copyButton.hidden !== shouldHide) copyButton.hidden = shouldHide;
    if (linkButton.hidden !== shouldHide) linkButton.hidden = shouldHide;
  };

  async function writeText(text, button, successText) {
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = successText;
      setTimeout(() => {
        button.textContent = button === copyButton ? "Copiar" : "Copiar enlace";
      }, 1400);
      return true;
    } catch (_) {
      return false;
    }
  }

  copyButton.addEventListener("click", async () => {
    const code = currentCode();
    if (!hasValidCode()) return;
    const copied = await writeText(code, copyButton, "Copiado");
    if (copied) return;

    const range = document.createRange();
    range.selectNodeContents(pairCode);
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
    copyButton.textContent = "Seleccionado";
    setTimeout(() => { copyButton.textContent = "Copiar"; }, 1400);
  });

  linkButton.addEventListener("click", async () => {
    const code = currentCode();
    if (!hasValidCode()) return;
    const url = `${window.location.origin}/api/pair/${encodeURIComponent(code)}`;
    await writeText(url, linkButton, "Enlace copiado");
  });

  const boxObserver = new MutationObserver(refreshVisibility);
  boxObserver.observe(pairBox, {
    attributes: true,
    attributeFilter: ["hidden"]
  });

  const codeObserver = new MutationObserver(refreshVisibility);
  codeObserver.observe(pairCode, {
    childList: true,
    subtree: true,
    characterData: true
  });

  refreshVisibility();
})();
