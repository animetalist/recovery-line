(() => {
  const header = document.querySelector(".site-header");
  const button = document.querySelector(".menu-toggle");
  const nav = document.querySelector("#primary-navigation");

  if (!header || !button || !nav) {
    return;
  }

  document.documentElement.classList.add("has-menu-js");
  header.dataset.menuOpen = "false";
  button.hidden = false;

  const isOpen = () => header.dataset.menuOpen === "true";

  const setMenuState = (open) => {
    header.dataset.menuOpen = open ? "true" : "false";
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Закрити навігацію" : "Відкрити навігацію");
  };

  button.addEventListener("click", () => {
    setMenuState(!isOpen());
  });

  document.addEventListener("click", (event) => {
    if (!isOpen()) {
      return;
    }

    if (button.contains(event.target)) {
      return;
    }

    if (nav.contains(event.target)) {
      if (event.target.closest("a, button")) {
        setMenuState(false);
      }
      return;
    }

    setMenuState(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen()) {
      setMenuState(false);
    }
  });
})();
