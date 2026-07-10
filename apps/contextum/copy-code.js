(() => {
  "use strict";

  const pairBox = document.getElementById("pairBox");
  const pairCode = document.getElementById("pairCode");
  if (!pairBox || !pairCode) return;

  const button = document.createElement("button");
  button.id = "pairCopyButton";
  button.className = "secondary-button";
  button.type = "button";
  button.textContent = "Copiar";
  button.hidden = true;
  pairBox.appendChild(button);

  const refresh = () => {
    const code = pairCode.textContent.trim();
    button.hidden = !code || code === "—" || pairBox.hidden;
  };

  const copyCode = async () => {
    const code = pairCode.textContent.trim();
    if (!code || code === "—") return;

    try {
      await navigator.clipboard.writeText(code);
      button.textContent = "Copiado";
      setTimeout(() => { button.textContent = "Copiar"; }, 1400);
    } catch (_) {
      const range = document.createRange();
      range.selectNodeContents(pairCode);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = "Seleccionado";
      setTimeout(() => { button.textContent = "Copiar"; }, 1400);
    }
  };

  button.addEventListener("click", copyCode);
  new MutationObserver(refresh).observe(pairBox, {
    attributes: true,
    childList: true,
    subtree: true,
    characterData: true
  });

  refresh();
})();