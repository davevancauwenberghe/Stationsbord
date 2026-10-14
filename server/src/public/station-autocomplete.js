import { asArray } from "./rail-utils.js?v=0.9.6";

// Each station field owns its request and active option. A late response cannot
// reopen a dismissed list or populate the other station's suggestions.
export function stationAutocomplete({
  input,
  list,
  clear,
  status,
  request,
  t,
  getLang,
  shortcuts,
  onSelect,
  onEdit,
}) {
  let controller,
    timer,
    sequence = 0,
    options = [],
    active = -1;
  const cancel = () => {
    clearTimeout(timer);
    controller?.abort();
    sequence++;
  };
  const close = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  };
  const dismiss = () => {
    cancel();
    close();
  };
  const highlight = () => {
    [...list.children].forEach((item, i) =>
      item.setAttribute("aria-selected", String(i === active)),
    );
    if (active >= 0) {
      input.setAttribute("aria-activedescendant", list.children[active].id);
      list.children[active].scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  };
  const set = (station) => {
    dismiss();
    input.value = station?.name || "";
    clear.hidden = !input.value;
    input.removeAttribute("aria-invalid");
    status.textContent = "";
  };
  const choose = (station) => {
    set(station);
    onSelect(station);
  };
  const show = (stations) => {
    options = asArray(stations)
      .filter(
        (s) => s && typeof s.id === "string" && typeof s.name === "string",
      )
      .slice(0, 10);
    active = -1;
    input.removeAttribute("aria-activedescendant");
    list.replaceChildren();
    options.forEach((station, i) => {
      const item = document.createElement("div");
      item.className = "station-option";
      item.id = `${list.id}-${i}`;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", "false");
      item.textContent = station.name;
      item.addEventListener("pointerdown", (event) => event.preventDefault());
      item.addEventListener("click", () => choose(station));
      list.append(item);
    });
    list.hidden = !options.length;
    input.setAttribute("aria-expanded", String(!!options.length));
  };
  const search = async () => {
    const term = input.value.trim();
    if (term.length < 2) {
      show(term ? [] : shortcuts());
      status.textContent = "";
      return;
    }
    const current = ++sequence;
    controller = new AbortController();
    status.textContent = t("searching");
    try {
      const { data } = await request(
        `/api/stations/search?${new URLSearchParams({ q: term, lang: getLang(), limit: "10" })}`,
        controller.signal,
      );
      if (sequence !== current) return;
      show(data.results);
      status.textContent = options.length ? "" : t("noStations");
    } catch (error) {
      if (sequence !== current || error.name === "AbortError") return;
      close();
      status.textContent = t("searchError");
    }
  };
  input.addEventListener("input", () => {
    dismiss();
    onEdit();
    input.removeAttribute("aria-invalid");
    status.textContent = "";
    clear.hidden = !input.value;
    timer = setTimeout(search, 180);
  });
  input.addEventListener("focus", () => {
    if (!input.value.trim()) show(shortcuts());
  });
  input.addEventListener("blur", dismiss);
  clear.addEventListener("click", () => {
    set(null);
    onEdit();
    input.focus();
  });
  input.addEventListener("keydown", (event) => {
    if (["Escape", "Tab"].includes(event.key)) {
      dismiss();
      return;
    }
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      if (list.hidden) {
        cancel();
        search();
        return;
      }
      active = Math.max(
        0,
        Math.min(
          options.length - 1,
          active + (event.key === "ArrowDown" ? 1 : -1),
        ),
      );
      if (options.length) highlight();
    } else if (event.key === "Enter" && !list.hidden && options.length) {
      event.preventDefault();
      choose(options[active < 0 ? 0 : active]);
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!input.closest(".autocomplete").contains(event.target)) dismiss();
  });
  return { set, dismiss, search };
}
