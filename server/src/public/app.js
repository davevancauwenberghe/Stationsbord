// app.js
(function () {
  const q = document.getElementById("q");
  const dropdown = document.getElementById("dropdown");
  const board = document.getElementById("board");
  // Disturbances pill (header)
  const disturbancePill = document.getElementById("disturbancePill");

  const datePrettyEl = document.getElementById("datePretty"); // DD/MM/YYYY
  const timePrettyEl = document.getElementById("timePretty"); // HH:MM
  const btnNow = document.getElementById("btnNow");
  const btnPlus1h = document.getElementById("btnPlus1h");
  const languageSelect = document.getElementById("languageSelect");
  const languageLabel = document.getElementById("languageLabel");

  const overlay = document.getElementById("overlay");
  const overlayClose = document.getElementById("overlayClose");
  const modalTitle = document.getElementById("modalTitle");
  const modalPill = document.getElementById("modalPill");
  const modalBody = document.getElementById("modalBody");

  // Offline/stale banner (sticky under header)
  const offlineBanner = document.getElementById("offlineBanner");

  let selected = null;
  let lastResults = [];
  let activeIdx = -1;
  let typingTimer = null;
  let inFlight = null;
  const allowedLanguages = new Set(["en", "nl", "fr", "de"]);
  const recentStationsKey = "stationsbord.recentStations";
  const maxRecentStations = 3;

  const translations = {
    en: { title: "Stationsbord", placeholder: "Type a station (e.g. Gent, Bruxelles)", date: "Date (DD/MM/YYYY)", time: "Time (HH:MM)", now: "Now", nowTitle: "Set to current time (local)", plusTitle: "Add one hour from the currently selected time", language: "Language", intro: "Start typing a station name or tap the field to pick a recent station. Selecting a station loads the board.", recent: "Recent", ready: "ready", disturbances: "disturbances", selected: "selected", searching: "searching…", pickStation: "pick station", noMatches: "no matches", searchError: "search error", loading: "Loading…", trainDetails: "Train details", vehicle: "vehicle", departures: "departures", at: "at", updated: "updated", occupancy: "occupancy", platform: "PLATFORM", platformLower: "platform", noResults: "No departures found for this moment.", stationAlert: "Pick a station from the dropdown first", timeAlert: "Time must be HH:MM (e.g. 07:30, 23:15).", error: "Error", ok: "ok", cancelled: "cancelled", composition: "composition", carriages: "carriages", seats: "seats", standing: "standing", length: "length", amenities: "amenities", toilets: "toilets", bikes: "bikes", accessibility: "accessibility", outlets: "outlets", airco: "airco" },
    nl: { title: "Stationsbord", placeholder: "Typ een station (bv. Gent, Brussel)", date: "Datum (DD/MM/JJJJ)", time: "Tijd (UU:MM)", now: "Nu", nowTitle: "Zet op huidige tijd (lokaal)", plusTitle: "Tel één uur bij de gekozen tijd", language: "Taal", intro: "Typ een station of tik op het veld voor recente stations. Een station kiezen laadt het bord.", recent: "Recent", ready: "klaar", disturbances: "storingen", selected: "geselecteerd", searching: "zoeken…", pickStation: "kies station", noMatches: "geen resultaten", searchError: "zoekfout", loading: "Laden…", trainDetails: "Treindetails", vehicle: "voertuig", departures: "vertrekken", at: "om", updated: "bijgewerkt", occupancy: "bezetting", platform: "PERRON", platformLower: "perron", noResults: "Geen vertrekken gevonden voor dit moment.", stationAlert: "Kies eerst een station uit de lijst", timeAlert: "Tijd moet UU:MM zijn (bv. 07:30, 23:15).", error: "Fout", ok: "ok", cancelled: "afgeschaft", composition: "samenstelling", carriages: "rijtuigen", seats: "zitplaatsen", standing: "staanplaatsen", length: "lengte", amenities: "voorzieningen", toilets: "toiletten", bikes: "fietsen", accessibility: "toegankelijkheid", outlets: "stopcontacten", airco: "airco" },
    fr: { title: "Stationsbord", placeholder: "Tapez une gare (p. ex. Gand, Bruxelles)", date: "Date (JJ/MM/AAAA)", time: "Heure (HH:MM)", now: "Maintenant", nowTitle: "Définir l’heure actuelle (locale)", plusTitle: "Ajouter une heure à l’heure sélectionnée", language: "Langue", intro: "Tapez une gare ou touchez le champ pour voir les gares récentes. Le choix d’une gare charge le tableau.", recent: "Récent", ready: "prêt", disturbances: "perturbations", selected: "sélectionné", searching: "recherche…", pickStation: "choisir gare", noMatches: "aucun résultat", searchError: "erreur recherche", loading: "Chargement…", trainDetails: "Détails du train", vehicle: "véhicule", departures: "départs", at: "à", updated: "mis à jour", occupancy: "occupation", platform: "VOIE", platformLower: "voie", noResults: "Aucun départ trouvé pour ce moment.", stationAlert: "Choisissez d’abord une gare dans la liste", timeAlert: "L’heure doit être HH:MM (p. ex. 07:30, 23:15).", error: "Erreur", ok: "ok", cancelled: "supprimé", composition: "composition", carriages: "voitures", seats: "places assises", standing: "places debout", length: "longueur", amenities: "équipements", toilets: "toilettes", bikes: "vélos", accessibility: "accessibilité", outlets: "prises", airco: "climatisation" },
    de: { title: "Stationsbord", placeholder: "Bahnhof eingeben (z. B. Gent, Brüssel)", date: "Datum (TT/MM/JJJJ)", time: "Zeit (HH:MM)", now: "Jetzt", nowTitle: "Auf aktuelle lokale Zeit setzen", plusTitle: "Eine Stunde zur ausgewählten Zeit hinzufügen", language: "Sprache", intro: "Bahnhof eingeben oder das Feld antippen, um zuletzt gesuchte Bahnhöfe zu sehen. Die Auswahl lädt die Tafel.", recent: "Zuletzt", ready: "bereit", disturbances: "Störungen", selected: "ausgewählt", searching: "suche…", pickStation: "Bahnhof wählen", noMatches: "keine Treffer", searchError: "Suchfehler", loading: "Laden…", trainDetails: "Zugdetails", vehicle: "Fahrzeug", departures: "Abfahrten", at: "um", updated: "aktualisiert", occupancy: "Auslastung", platform: "GLEIS", platformLower: "Gleis", noResults: "Keine Abfahrten für diesen Zeitpunkt gefunden.", stationAlert: "Wählen Sie zuerst einen Bahnhof aus der Liste", timeAlert: "Zeit muss HH:MM sein (z. B. 07:30, 23:15).", error: "Fehler", ok: "ok", cancelled: "fällt aus", composition: "Zusammenstellung", carriages: "Wagen", seats: "Sitzplätze", standing: "Stehplätze", length: "Länge", amenities: "Ausstattung", toilets: "Toiletten", bikes: "Fahrräder", accessibility: "Barrierefreiheit", outlets: "Steckdosen", airco: "Klimaanlage" }
  };
  function t(key) { return (translations[getLanguage()] && translations[getLanguage()][key]) || translations.en[key] || key; }

  // Banner “don’t lie yet” state
  let bannerWaitingForFresh = false;

  // vehicle overlay fetch controller (abort on close)
  let vehicleController = null;

  // Disturbances cache
  let lastDisturbancesAll = [];
  let lastDisturbancesUnplanned = [];

  // Body scroll lock while overlay open
  let prevOverflowBody = "";
  let prevOverflowHtml = "";
  let prevBodyPosition = "";
  let prevBodyTop = "";
  let prevBodyWidth = "";
  let lockedScrollY = 0;
  let scrollLocked = false;

  // Track whether last edit action was delete/backspace (for pretty input UX)
  let lastEditWasDelete = false;

  function lockScroll() {
    if (scrollLocked) return;
    scrollLocked = true;

    // Store inline styles only (avoid computed-style traps)
    prevOverflowBody = document.body.style.overflow || "";
    prevOverflowHtml = document.documentElement.style.overflow || "";
    prevBodyPosition = document.body.style.position || "";
    prevBodyTop = document.body.style.top || "";
    prevBodyWidth = document.body.style.width || "";
    lockedScrollY = window.scrollY || window.pageYOffset || 0;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = "-" + lockedScrollY + "px";
    document.body.style.width = "100%";
  }

  function unlockScroll() {
    document.body.style.overflow = prevOverflowBody || "";
    document.documentElement.style.overflow = prevOverflowHtml || "";
    document.body.style.position = prevBodyPosition || "";
    document.body.style.top = prevBodyTop || "";
    document.body.style.width = prevBodyWidth || "";

    if (lockedScrollY) window.scrollTo(0, lockedScrollY);

    prevOverflowBody = "";
    prevOverflowHtml = "";
    prevBodyPosition = "";
    prevBodyTop = "";
    prevBodyWidth = "";
    lockedScrollY = 0;
    scrollLocked = false;
  }


  function getLanguage() {
    const value = String(languageSelect?.value || "").toLowerCase();
    return allowedLanguages.has(value) ? value : "en";
  }

  function browserLanguage() {
    const langs = Array.from(navigator.languages || [navigator.language || "en"]);
    for (const lang of langs) {
      const code = String(lang || "").toLowerCase().split("-")[0];
      if (allowedLanguages.has(code)) return code;
    }
    return "en";
  }

  function setDocumentLanguage() {
    document.documentElement.lang = getLanguage();
  }

  function applyLanguage() {
    setDocumentLanguage();
    document.title = t("title");
    const heading = document.querySelector("h1");
    if (heading) heading.textContent = t("title");
    q.placeholder = t("placeholder");
    btnNow.textContent = t("now");
    btnNow.title = t("nowTitle");
    btnPlus1h.title = t("plusTitle");
    const labels = document.querySelectorAll(".controls label");
    if (labels[0]) labels[0].firstChild.textContent = t("date") + " ";
    if (labels[1]) labels[1].firstChild.textContent = t("time") + " ";
    if (languageLabel) languageLabel.textContent = t("language");
    if (disturbancePill && !/\d/.test(disturbancePill.textContent || "")) disturbancePill.textContent = t("disturbances") + "…";
    const onlyMuted = board.children.length === 1 ? board.querySelector(".muted") : null;
    if (onlyMuted) onlyMuted.textContent = t("intro");
    refreshRecentDropdownIfOpen();
  }

  function readRecentStations() {
    try {
      const parsed = JSON.parse(localStorage.getItem(recentStationsKey) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((station) => station && station.id && station.name)
        .slice(0, maxRecentStations);
    } catch (_e) {
      return [];
    }
  }

  function writeRecentStations(stations) {
    try {
      localStorage.setItem(recentStationsKey, JSON.stringify(stations.slice(0, maxRecentStations)));
    } catch (_e) {
      // Ignore storage failures; recent searches are only a convenience.
    }
  }

  function rememberRecentStation(station) {
    if (!station || !station.id || !station.name) return;
    const normalized = { id: station.id, name: station.name };
    const existing = readRecentStations().filter((item) => item.id !== normalized.id);
    writeRecentStations([normalized, ...existing]);
    refreshRecentDropdownIfOpen();
  }

  function recentStationResults() {
    return readRecentStations().map((station) => ({ ...station, recent: true }));
  }

  function showRecentStationsDropdown() {
    const stations = recentStationResults();
    if (!stations.length || q.value.trim().length >= 2) return;
    lastResults = stations;
    activeIdx = -1;
    renderDropdown(lastResults);
    setStatus(t("pickStation"));
  }

  function refreshRecentDropdownIfOpen() {
    if (!dropdown.classList.contains("open") || q.value.trim().length >= 2) return;
    showRecentStationsDropdown();
  }


  function resetStationSelectionForLanguageChange() {
    selected = null;
    lastResults = [];
    activeIdx = -1;
    dropdown.innerHTML = "";
    closeDropdown();
    if (q.value.trim().length >= 2) debounceSearch();
  }

  function setStatus(_text, _kind = "normal") {
    // The old visible status pill (including the “ok” state) was removed to keep
    // the interface focused on the board and disturbance indicator.
  }

  /* ---- Offline/stale banner based on X-Cache ---- */
  function hideBanner() {
    if (!offlineBanner) return;
    offlineBanner.hidden = true;
    offlineBanner.textContent = "";
  }

  function showBanner(message) {
    if (!offlineBanner) return;
    offlineBanner.hidden = false;
    offlineBanner.textContent = message;
  }

  function updateBannerFromXCache(xcache) {
    const raw = String(xcache || "").trim();
    if (!raw) {
      hideBanner();
      return;
    }

    const v = raw.toLowerCase();

    if (v.startsWith("stale")) {
      let reason = "Offline mode: showing cached results.";
      if (v.includes("local-rate-limit")) reason = "Offline mode: showing cached results (rate limited).";
      else if (v.includes("upstream-502")) reason = "Offline mode: showing cached results (gateway error).";
      else if (v.includes("upstream-503")) reason = "Offline mode: showing cached results (service unavailable).";
      else if (v.includes("upstream-504")) reason = "Offline mode: showing cached results (timeout).";
      else if (v.includes("upstream-err")) reason = "Offline mode: showing cached results (error).";

      showBanner(reason);
      return;
    }

    if (v === "hit" || v === "miss" || v.startsWith("revalidated")) {
      hideBanner();
    }
  }

  // When we come back online, don't immediately hide the banner.
  // Only hide it after we see a *fresh* (non-STALE) response.
  function noteFreshResponseIfAny(xcache) {
    const raw = String(xcache || "").trim();
    if (!raw) return;

    const v = raw.toLowerCase();
    if (bannerWaitingForFresh && !v.startsWith("stale")) {
      bannerWaitingForFresh = false;
      hideBanner();
    }
  }

  function updateBannerFromNavigator() {
    if (!offlineBanner) return;

    if (navigator && navigator.onLine === false) {
      bannerWaitingForFresh = true;
      showBanner("Offline: no network connection.");
      return;
    }

    if (bannerWaitingForFresh) {
      showBanner("Back online — verifying live data…");
    }
  }

  window.addEventListener("offline", updateBannerFromNavigator);
  window.addEventListener("online", updateBannerFromNavigator);

  /* ---- Dropdown ---- */
  function openDropdown() {
    dropdown.classList.add("open");
    q.setAttribute("aria-expanded", "true");
  }
  function closeDropdown() {
    dropdown.classList.remove("open");
    q.setAttribute("aria-expanded", "false");
    activeIdx = -1;
    q.removeAttribute("aria-activedescendant");
  }

  function renderDropdown(results) {
    dropdown.innerHTML = "";
    if (!results.length) {
      closeDropdown();
      return;
    }
    for (let i = 0; i < results.length; i++) {
      const s = results[i];
      const div = document.createElement("div");
      div.className = "dd-item";
      div.dataset.idx = String(i);
      div.id = "station-option-" + String(i);
      div.setAttribute("role", "option");
      div.setAttribute("aria-selected", "false");
      div.tabIndex = -1;
      const meta = s.recent ? t("recent") : s.id;
      div.innerHTML =
        '<div><div class="dd-name">' +
        escapeHtml(s.name) +
        "</div></div>" +
        '<div class="dd-id">' +
        escapeHtml(meta) +
        "</div>";
      div.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pickResult(i);
      });
      div.addEventListener("click", () => pickResult(i));
      div.addEventListener("touchstart", () => { activeIdx = i; highlightActive(); }, { passive: true });
      dropdown.appendChild(div);
    }
    openDropdown();
  }

  function highlightActive() {
    const items = dropdown.querySelectorAll(".dd-item");
    items.forEach((el, idx) => {
      const active = idx === activeIdx;
      el.style.background = active ? "rgba(255,255,255,.08)" : "";
      el.setAttribute("aria-selected", active ? "true" : "false");
    });
    if (activeIdx >= 0) q.setAttribute("aria-activedescendant", "station-option-" + String(activeIdx));
    else q.removeAttribute("aria-activedescendant");
  }

  function pickResult(idx) {
    const s = lastResults[idx];
    if (!s) return;
    selected = { id: s.id, name: s.name };
    q.value = s.name;
    closeDropdown();
    setStatus(t("selected"));
    searchLiveboard();
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmtTime(unixSeconds) {
    const d = new Date(unixSeconds * 1000);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // Normalizes iRail-ish occupancy strings into a stable label
  function normalizeOccName(occ) {
    const n = String(occ || "unknown").toLowerCase();
    if (n.includes("low")) return { label: "low" };
    if (n.includes("medium")) return { label: "medium" };
    if (n.includes("high")) return { label: "high" };
    return { label: "unknown" };
  }

  function occTierClassFromLabel(label, pillBaseClass) {
    let cls = pillBaseClass || "pill";
    if (label === "low") cls += " tierOk";
    else if (label === "medium") cls += " tierWarn";
    else if (label === "high") cls += " tierBad";
    return cls;
  }

  // delay helpers
  function delayMinutesFromSeconds(delaySeconds) {
    if (delaySeconds == null) return null;
    const s = Number(delaySeconds);
    if (!Number.isFinite(s)) return null;

    const abs = Math.abs(s);
    if (abs > 0 && abs < 60) return 1;
    return Math.round(abs / 60);
  }

  function delayTier(mins, cancelled) {
    if (cancelled) return "bad";
    if (mins == null) return null;
    if (mins <= 0) return "ok";
    if (mins <= 5) return "warn";
    return "bad";
  }

  function delayPillHtml(delaySeconds, cancelled) {
    if (cancelled) return "";

    const mins = delayMinutesFromSeconds(delaySeconds);
    const tier = delayTier(mins, false);
    if (!tier) return "";

    if (tier === "ok") return '<span class="pill tierOk pulseOk">0m</span>';
    if (tier === "warn") return '<span class="pill tierWarn">+' + mins + 'm</span>';
    return '<span class="pill tierBad">+' + mins + 'm</span>';
  }

  function delayMini(delaySeconds, cancelled) {
    if (cancelled) return '<span class="miniPill tierBad">' + t("cancelled") + "</span>";

    const mins = delayMinutesFromSeconds(delaySeconds);
    if (mins == null) return "";

    const tier = delayTier(mins, false);
    if (!tier) return "";

    if (tier === "ok") return '<span class="miniPill tierOk pulseOk">0m</span>';
    if (tier === "warn") return '<span class="miniPill tierWarn">+' + mins + 'm</span>';
    return '<span class="miniPill tierBad">+' + mins + 'm</span>';
  }
  
  // Pretty date and time input
  function clamp(n, lo, hi) {
    n = Number(n);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
  }

  function getSel(el) {
    try {
      return {
        start: typeof el.selectionStart === "number" ? el.selectionStart : el.value.length,
        end: typeof el.selectionEnd === "number" ? el.selectionEnd : el.value.length,
      };
    } catch (_e) {
      return { start: el.value.length, end: el.value.length };
    }
  }

  function setCaret(el, pos) {
    try {
      el.setSelectionRange(pos, pos);
    } catch (_e) {}
  }

  // Map caret position -> "digit index"
  function digitIndexFromCaret(maskedValue, caretPos) {
    const left = maskedValue.slice(0, caretPos);
    const m = left.match(/\d/g);
    return m ? m.length : 0;
  }

  // Map "digit index" -> caret position in masked string
  function caretFromDigitIndex(maskedValue, digitIdx) {
    if (digitIdx <= 0) return 0;
    let seen = 0;
    for (let i = 0; i < maskedValue.length; i++) {
      if (/\d/.test(maskedValue[i])) {
        seen++;
        if (seen >= digitIdx) return i + 1;
      }
    }
    return maskedValue.length;
  }

  function maskDigitsToDate(digits) {
    digits = String(digits || "").replace(/\D/g, "").slice(0, 8);
    let out = "";
    for (let i = 0; i < digits.length; i++) {
      out += digits[i];
      if (i === 1 || i === 3) {
        if (digits.length > i + 1) out += "/";
      }
    }
    return out;
  }

  function maskDigitsToTime(digits) {
    digits = String(digits || "").replace(/\D/g, "").slice(0, 4);
    let out = "";
    for (let i = 0; i < digits.length; i++) {
      out += digits[i];
      if (i === 1) {
        if (digits.length > i + 1) out += ":";
      }
    }
    return out;
  }
  
  function smartDeleteAroundSeparator(el, sepChar, maxDigits) {
    const v = String(el.value || "");
    const sel = getSel(el);
    if (sel.start !== sel.end) return false; // range delete -> let input handler do it

    const pos = sel.start;
    if (pos <= 0 || pos > v.length) return false;

    // backspace right after separator
    if (v[pos - 1] === sepChar) {
      // remove the digit before separator as well (if any)
      const before = v.slice(0, pos - 1);
      const after = v.slice(pos);

      // remove last digit from "before"
      const beforeDigits = before.replace(/\D/g, "");
      const newBeforeDigits = beforeDigits.slice(0, -1);

      // keep only digits from after (user can keep editing)
      const afterDigits = after.replace(/\D/g, "");

      const newDigits = (newBeforeDigits + afterDigits).slice(0, maxDigits);
      const isDate = maxDigits === 8;

      const masked = isDate ? maskDigitsToDate(newDigits) : maskDigitsToTime(newDigits);

      // caret: stay at the boundary where the digit was removed
      const caretDigitIdx = clamp(newBeforeDigits.length, 0, maxDigits);
      const newCaret = caretFromDigitIndex(masked, caretDigitIdx);

      el.value = masked;
      setCaret(el, newCaret);
      return true;
    }
    return false;
  }

  function handlePrettyInput(el, kind) {
    const maxDigits = kind === "date" ? 8 : 4;
    const sepChar = kind === "date" ? "/" : ":";

    const prevValue = String(el.value || "");
    const sel = getSel(el);
    const caretPos = sel.start;

    // "digit index" before we mutate
    const caretDigitIdx = digitIndexFromCaret(prevValue, caretPos);

    // Extract digits then re-mask
    const digits = prevValue.replace(/\D/g, "").slice(0, maxDigits);
    const masked = kind === "date" ? maskDigitsToDate(digits) : maskDigitsToTime(digits);

    el.value = masked;

    // Try to keep caret near the same digit position
    const nextCaret = caretFromDigitIndex(masked, caretDigitIdx);
    setCaret(el, nextCaret);
  }

  function wirePrettyInput(el, kind) {
    // beforeinput gives us reliable "deleteContentBackward" on modern browsers
    el.addEventListener("beforeinput", (e) => {
      const t = String(e?.inputType || "");
      lastEditWasDelete = t.startsWith("delete");

      if (t === "deleteContentBackward") {
        const handled = smartDeleteAroundSeparator(
          el,
          kind === "date" ? "/" : ":",
          kind === "date" ? 8 : 4
        );
        if (handled) {
          e.preventDefault();
        }
      }
    });

    el.addEventListener("input", () => {
      handlePrettyInput(el, kind);
      lastEditWasDelete = false;
    });
  }

  wirePrettyInput(datePrettyEl, "date");
  wirePrettyInput(timePrettyEl, "time");

  function prettyToIRailDate(ddmmyyyy) {
    const m = String(ddmmyyyy || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return "";
    const dd = m[1], mm = m[2], yyyy = m[3];
    return dd + mm + yyyy.slice(2);
  }

  function prettyToIRailTime(hhmm) {
    const m = String(hhmm || "").match(/^(\d{2}):(\d{2})$/);
    if (!m) return "";
    return m[1] + m[2];
  }

  function isValidTimePretty(v) {
    if (!/^\d{2}:\d{2}$/.test(v)) return false;
    const hh = Number(v.slice(0, 2));
    const mm = Number(v.slice(3, 5));
    return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
  }

  /* ---- Now + +1h ---- */
  function getSelectedMomentLocal() {
    const now = new Date();

    let year, month, day;
    const dm = datePrettyEl.value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dm) {
      day = Number(dm[1]);
      month = Number(dm[2]);
      year = Number(dm[3]);
    } else {
      day = now.getDate();
      month = now.getMonth() + 1;
      year = now.getFullYear();
    }

    let hh, mm;
    const tm = timePrettyEl.value.trim().match(/^(\d{2}):(\d{2})$/);
    if (tm) {
      hh = Number(tm[1]);
      mm = Number(tm[2]);
    } else {
      hh = now.getHours();
      mm = now.getMinutes();
    }

    return new Date(year, month - 1, day, hh, mm, 0, 0);
  }

  function setMomentLocal(d) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = String(d.getFullYear());
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");

    datePrettyEl.value = dd + "/" + mm + "/" + yyyy;
    timePrettyEl.value = hh + ":" + mi;
  }

  function setNow() {
    setMomentLocal(new Date());
  }

  btnNow.addEventListener("click", () => setNow());
  btnPlus1h.addEventListener("click", () => {
    const base = getSelectedMomentLocal();
    base.setHours(base.getHours() + 1);
    setMomentLocal(base);
    if (selected) searchLiveboard();
  });

  if (languageSelect) {
    languageSelect.addEventListener("change", () => {
      applyLanguage();
      resetStationSelectionForLanguageChange();
      refreshDisturbancesSafe();
    });
    languageSelect.value = browserLanguage();
    applyLanguage();
  }

  /* ---- Autocomplete ---- */
  async function searchStationsAuto() {
    const term = q.value.trim();
    selected = null;

    if (term.length < 2) {
      dropdown.innerHTML = "";
      showRecentStationsDropdown();
      if (!dropdown.classList.contains("open")) setStatus(t("ready"));
      return;
    }

    if (inFlight && typeof inFlight.abort === "function") inFlight.abort();
    const controller = new AbortController();
    inFlight = controller;

    setStatus(t("searching"), "loading");

    const r = await fetch(
      "/api/stations/search?q=" + encodeURIComponent(term) + "&limit=12&lang=" + encodeURIComponent(getLanguage()),
      { signal: controller.signal }
    ).catch((err) => {
      if (err && err.name === "AbortError") return null;
      throw err;
    });

    if (!r) return;

    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Search failed");

    lastResults = data.results || [];
    activeIdx = -1;
    renderDropdown(lastResults);
    setStatus(lastResults.length ? t("pickStation") : t("noMatches"));
  }

  function debounceSearch() {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      searchStationsAuto().catch((e) => {
        setStatus(t("searchError"), "error");
        closeDropdown();
        console.error(e);
      });
    }, 180);
  }

  q.addEventListener("input", debounceSearch);
  q.addEventListener("focus", () => {
    if (q.value.trim().length < 2) {
      showRecentStationsDropdown();
    } else if (lastResults.length) {
      openDropdown();
    }
  });
  q.addEventListener("blur", () => setTimeout(() => closeDropdown(), 120));

  q.addEventListener("keydown", (e) => {
    if (
      !dropdown.classList.contains("open") &&
      (e.key === "ArrowDown" || e.key === "ArrowUp")
    ) {
      if (lastResults.length) openDropdown();
    }

    if (dropdown.classList.contains("open")) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIdx = Math.min(lastResults.length - 1, activeIdx + 1);
        highlightActive();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIdx = Math.max(0, activeIdx - 1);
        highlightActive();
        return;
      }
      if (e.key === "Enter") {
        if (activeIdx >= 0) {
          e.preventDefault();
          pickResult(activeIdx);
          return;
        }
      }
      if (e.key === "Escape") {
        closeDropdown();
        return;
      }
    }

    if (e.key === "Enter" && !dropdown.classList.contains("open") && selected) {
      e.preventDefault();
      searchLiveboard();
    }
  });

  /* Overlay helpers (train details + disturbances) */
  function openOverlay() {
    const wasOpen = overlay.classList.contains("open");

    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");

    // Only lock scroll on the first open
    if (!wasOpen) lockScroll();
  }

  function closeOverlay() {
    try {
      overlay.classList.remove("open");
      overlay.setAttribute("aria-hidden", "true");
      modalTitle.textContent = t("trainDetails");
      modalPill.textContent = t("vehicle");
      modalBody.innerHTML = '<div class="muted">Closed.</div>';

      if (vehicleController) {
        try { vehicleController.abort(); } catch (_e) {}
        vehicleController = null;
      }
    } finally {
      unlockScroll();
    }
  }

  overlayClose.addEventListener("click", closeOverlay);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) closeOverlay();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) closeOverlay();
  });

  function occMini(occ) {
    const o = normalizeOccName(occ);
    const cls = occTierClassFromLabel(o.label, "miniPill");
    return '<span class="' + cls + '">' + t("occupancy") + ' : ' + escapeHtml(o.label) + "</span>";
  }

  function extraStopMini(flag) {
    return String(flag || "0") === "1"
      ? '<span class="miniPill tierWarn">extra stop</span>'
      : "";
  }

  function asArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  function parseCount(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function yesFlag(value) {
    return String(value || "0") === "1";
  }

  function sumUnits(units, key) {
    return units.reduce((total, unit) => total + parseCount(unit && unit[key]), 0);
  }

  function compositionLookupId(vehicleId, shortName) {
    const raw = String(shortName || vehicleId || "").trim();
    return raw.replace(/^BE\.NMBS\./i, "");
  }

  function extractCompositionSegments(data) {
    const segments = data && data.composition && data.composition.segments;
    return asArray(segments && segments.segment);
  }

  function renderComposition(data) {
    const segments = extractCompositionSegments(data);
    const units = segments.flatMap((segment) =>
      asArray(segment && segment.composition && segment.composition.units && segment.composition.units.unit)
    );

    if (!units.length) {
      return '<section class="compositionBox"><div class="sectionTitle">' +
        escapeHtml(t("composition")) +
        '</div><div class="muted">No composition details available for this vehicle.</div></section>';
    }

    const seatsFirst = sumUnits(units, "seatsFirstClass") + sumUnits(units, "seatsCoupeFirstClass");
    const seatsSecond = sumUnits(units, "seatsSecondClass") + sumUnits(units, "seatsCoupeSecondClass");
    const standing = sumUnits(units, "standingPlacesFirstClass") + sumUnits(units, "standingPlacesSecondClass");
    const length = sumUnits(units, "lengthInMeter");

    let html = '<section class="compositionBox">';
    html += '<div class="sectionTitle">' + escapeHtml(t("composition")) + '</div>';
    html += '<div class="compositionSummary">';
    html += '<span class="pill">' + escapeHtml(String(units.length)) + ' ' + escapeHtml(t("carriages")) + '</span>';
    html += '<span class="pill">1st ' + escapeHtml(String(seatsFirst)) + ' / 2nd ' + escapeHtml(String(seatsSecond)) + ' ' + escapeHtml(t("seats")) + '</span>';
    html += '<span class="pill">' + escapeHtml(String(standing)) + ' ' + escapeHtml(t("standing")) + '</span>';
    if (length) html += '<span class="pill">' + escapeHtml(String(length)) + 'm ' + escapeHtml(t("length")) + '</span>';
    html += '</div>';

    html += '<div class="compositionUnits">';
    for (const unit of units) {
      const material = unit.materialSubTypeName || (unit.materialType && [unit.materialType.parent_type, unit.materialType.sub_type].filter(Boolean).join("_")) || unit.tractionType || "unit";
      const seats = parseCount(unit.seatsFirstClass) + parseCount(unit.seatsSecondClass) + parseCount(unit.seatsCoupeFirstClass) + parseCount(unit.seatsCoupeSecondClass);
      const features = [];
      if (yesFlag(unit.hasToilets)) features.push(t("toilets"));
      if (yesFlag(unit.hasBikeSection)) features.push(t("bikes"));
      if (yesFlag(unit.hasPrmSection)) features.push(t("accessibility"));
      if (yesFlag(unit.hasFirstClassOutlets) || yesFlag(unit.hasSecondClassOutlets)) features.push(t("outlets"));
      if (yesFlag(unit.hasAirco)) features.push(t("airco"));

      html += '<div class="compositionUnit">';
      html += '<div><div class="unitTitle">' + escapeHtml(material) + '</div>';
      html += '<div class="unitMeta">#' + escapeHtml(unit.materialNumber || unit.id || "?") +
        (unit.materialType && unit.materialType.orientation ? ' · ' + escapeHtml(unit.materialType.orientation) : '') + '</div></div>';
      html += '<div class="unitBadges"><span class="miniPill">' + escapeHtml(String(seats)) + ' ' + escapeHtml(t("seats")) + '</span>';
      for (const feature of features) html += '<span class="miniPill">' + escapeHtml(feature) + '</span>';
      html += '</div></div>';
    }
    html += '</div></section>';
    return html;
  }

  async function fetchCompositionSafe(vehicleId, shortName, signal) {
    const id = compositionLookupId(vehicleId, shortName);
    if (!id) return null;

    const r = await fetch(
      "/api/composition?id=" + encodeURIComponent(id) + "&lang=" + encodeURIComponent(getLanguage()),
      { signal }
    );

    const xcache = r.headers.get("X-Cache");
    updateBannerFromXCache(xcache);
    noteFreshResponseIfAny(xcache);

    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Composition request failed");
    return data;
  }

  async function loadVehicleDetails(vehicleId) {
    const prettyDate = datePrettyEl.value.trim();
    const dateIRail = prettyDate ? prettyToIRailDate(prettyDate) : "";

    modalTitle.textContent = t("trainDetails");
    modalPill.textContent = "loading…";
    modalBody.innerHTML = '<div class="muted">' + t("loading") + '</div>';
    openOverlay();

    if (vehicleController) {
      try { vehicleController.abort(); } catch (_e) {}
    }
    vehicleController = new AbortController();

    let url =
      "/api/vehicle?id=" +
      encodeURIComponent(vehicleId) +
      "&lang=" +
      encodeURIComponent(getLanguage()) +
      "&alerts=false";
    if (dateIRail) url += "&date=" + encodeURIComponent(dateIRail);

    const r = await fetch(url, { signal: vehicleController.signal });

    const xcache = r.headers.get("X-Cache");
    updateBannerFromXCache(xcache);
    noteFreshResponseIfAny(xcache);

    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Vehicle request failed");

    const vinfo = data.vehicleinfo || {};
    const short = vinfo.shortname || vinfo.name || data.vehicle || vehicleId;

    modalTitle.textContent = short;
    modalPill.textContent = "stops";

    const compositionPromise = fetchCompositionSafe(vehicleId, short, vehicleController.signal).catch((e) => ({ __error: e }));

    const stops = data.stops && data.stops.stop ? data.stops.stop : [];
    if (!stops.length) {
      modalBody.innerHTML =
        '<div class="muted">No stop list available for this vehicle.</div>' +
        '<div class="muted" style="margin-top:6px;">Tip: try a date closer to “now”.</div>';
      return;
    }

    let html = "";
    html += '<div class="row" style="gap:8px; align-items:center;">';
    html += '<span class="pill">' + t("vehicle") + '</span>';
    html += '<span class="pill">' + escapeHtml(String(stops.length)) + " " + t("stops") + "</span>";
    if (data.timestamp) {
      html += '<span class="muted">' + t("updated") + ' : ' + new Date(data.timestamp * 1000).toLocaleString() + "</span>";
    }
    html += "</div>";

    html += '<div class="stops">';
    for (const s of stops) {
      const station =
        s.station ||
        (s.stationinfo && (s.stationinfo.name || s.stationinfo.standardname)) ||
        "Unknown";
      const platform = s.platform != null ? String(s.platform) : "?";

      const depT = s.scheduledDepartureTime
        ? fmtTime(s.scheduledDepartureTime)
        : s.departuretime
        ? fmtTime(s.departuretime)
        : "";
      const arrT = s.scheduledArrivalTime
        ? fmtTime(s.scheduledArrivalTime)
        : s.arrivaltime
        ? fmtTime(s.arrivaltime)
        : "";
      const fallbackT = s.time != null ? fmtTime(s.time) : "";

      const depLine = depT ? "Dep " + escapeHtml(depT) : fallbackT ? "Dep " + escapeHtml(fallbackT) : "Dep —";
      const arrLine = arrT ? "Arr " + escapeHtml(arrT) : "Arr —";

      const depDelay = s.departureDelay;
      const arrDelay = s.arrivalDelay;

      const depCan = String(s.departureCanceled || "0") === "1";
      const arrCan = String(s.arrivalCanceled || "0") === "1";

      const depBadges = delayMini(depDelay, depCan);
      const arrBadges = delayMini(arrDelay, arrCan);

      const occ =
        s.occupancy && (s.occupancy.name || s.occupancy["@id"])
          ? s.occupancy.name || "unknown"
          : "unknown";

      html += '<div class="stopRow">';
      html += "<div>";
      html += '<div class="timeStack">';
      html += '  <div class="depLine">' + depLine + (depBadges ? ' ' + depBadges : '') + "</div>";
      html += '  <div class="arrLine">' +
        '<span class="miniPill">' + arrLine + "</span>" +
        (arrBadges ? ' ' + arrBadges : '') +
        "</div>";
      html += "</div>";
      const extra = extraStopMini(s.isExtraStop);
      html += extra
        ? '<div class="stopMeta">' + extra + "</div>"
        : '<div class="stopMeta"></div>';
      html += "</div>";

      html += "<div>";
      html += '<div class="stopStack">';
      html += '  <div class="stopStation">' + escapeHtml(station) + "</div>";
      html += '  <div class="stopOcc">' + occMini(occ) + "</div>";
      html += "</div>";
      html += "</div>";

      html += '<div style="justify-self:end; text-align:right;">';
      html += '<span class="miniPill">platform ' + escapeHtml(platform) + "</span>";
      html += "</div>";

      html += "</div>";
    }
    html += "</div>";

    const composition = await compositionPromise;
    if (composition && !composition.__error) {
      html += renderComposition(composition);
      modalPill.textContent = "stops + " + t("composition");
    } else if (composition && composition.__error) {
      html += '<section class="compositionBox"><div class="sectionTitle">' + escapeHtml(t("composition")) + '</div><div class="muted">Composition unavailable: ' + escapeHtml(composition.__error.message) + '</div></section>';
    }

    modalBody.innerHTML = html;
  }

  /* ---- Disturbances (pill + overlay) ---- */
  function extractDisturbances(data) {
    const root =
      data && (data.disturbances || data.disturbance || data.disruption || data.disruptions);

    if (!root) return [];

    if (Array.isArray(root)) return root;

    if (Array.isArray(root.disturbance)) return root.disturbance;
    if (Array.isArray(root.disruption)) return root.disruption;
    if (Array.isArray(root.disruptions)) return root.disruptions;

    if (typeof root === "object") return [root];
    return [];
  }

  function isPlannedDisturbance(d) {
    const hay = [
      d && d.type,
      d && d.category,
      d && d.impact,
      d && d.severity,
      d && d.status,
      d && d.title,
      d && d.header,
      d && d.description,
      d && d.message,
      d && d.text
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return hay.includes("planned");
  }

  function setDisturbancePill(count) {
    if (!disturbancePill) return;

    disturbancePill.hidden = false;
    disturbancePill.className = "pill pillBtn";

    if (!Number.isFinite(count)) {
      disturbancePill.textContent = t("disturbances") + " ?";
      return;
    }

    disturbancePill.textContent = t("disturbances") + ": " + String(count);

    if (count <= 0) disturbancePill.classList.add("tierOk");
    else disturbancePill.classList.add("tierBad");
  }

  function bestText(d, keys) {
    for (const k of keys) {
      const v = d && d[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  }

  function renderDisturbancesOverlay(listUnplanned, countUnplanned, listAll) {
    modalTitle.textContent = t("disturbances");
    modalPill.textContent = String(countUnplanned);

    const all = Array.isArray(listAll) ? listAll : [];
    const unplanned = Array.isArray(listUnplanned) ? listUnplanned : [];
    const planned = all.filter((d) => isPlannedDisturbance(d));

    let showPlanned = false;

    function render() {
      let html = "";

      html += '<div class="row" style="gap:8px; align-items:center; margin-bottom:10px;">';
      html += '<span class="pill">active: ' + escapeHtml(String(unplanned.length)) + "</span>";

      if (planned.length > 0) {
        html +=
          '<button id="distTogglePlanned" class="pill pillBtn" type="button" ' +
          'title="Toggle planned works">' +
          (showPlanned ? "hide planned" : "show planned") +
          "</button>";
        html += '<span class="pill">planned: ' + escapeHtml(String(planned.length)) + "</span>";
      }
      html += "</div>";

      if (unplanned.length === 0) {
        html += '<div class="muted">No active disturbances (excluding planned works).</div>';
        if (planned.length > 0) {
          html += '<div class="muted" style="margin-top:6px;">Tip: toggle “show planned” to view works.</div>';
        }
      }

      const listToShow = showPlanned ? all : unplanned;

      if (!listToShow.length) {
        modalBody.innerHTML = html || '<div class="muted">No disturbances available.</div>';
        wireToggle();
        return;
      }

      html += '<div class="distList">';
      for (const d of listToShow) {
        const plannedFlag = isPlannedDisturbance(d);

        const title = bestText(d, ["title", "header", "cause", "type"]) || "Disturbance";
        const desc = bestText(d, ["description", "message", "text", "body"]) || "";

        const impact = bestText(d, ["impact", "severity", "category", "status", "type"]);
        const when = bestText(d, ["when", "timestamp", "time", "from", "starttime", "startTime"]);

        const link = bestText(d, ["link", "url", "moreinfo", "moreInfo"]);
        const attachment = bestText(d, ["attachment", "file", "pdf", "document"]);

        let meta = "";
        if (plannedFlag) meta += '<span class="pill">planned</span>';
        if (impact) meta += '<span class="pill">' + escapeHtml(impact) + "</span>";
        if (when) meta += '<span class="pill">' + escapeHtml(when) + "</span>";
        if (link) meta += '<a class="distLink" href="' + escapeHtml(link) + '" target="_blank" rel="noopener">More info</a>';
        if (attachment) meta += '<a class="distLink" href="' + escapeHtml(attachment) + '" target="_blank" rel="noopener">Attachment</a>';

        html += '<div class="distItem">';
        html += '<div class="distTitle">' + escapeHtml(title) + "</div>";
        if (desc) html += '<div class="distDesc">' + escapeHtml(desc) + "</div>";
        else html += '<div class="distDesc muted">No details provided.</div>';
        if (meta) html += '<div class="distMeta">' + meta + "</div>";
        html += "</div>";
      }
      html += "</div>";

      modalBody.innerHTML = html;
      wireToggle();
    }

    function wireToggle() {
      const btn = modalBody.querySelector("#distTogglePlanned");
      if (!btn) return;
      btn.addEventListener("click", () => {
        showPlanned = !showPlanned;
        render();
      });
    }

    render();
  }

  async function fetchDisturbances() {
    const r = await fetch("/api/disturbances?lang=" + encodeURIComponent(getLanguage()), { cache: "no-store" });

    const xcache = r.headers.get("X-Cache");
    updateBannerFromXCache(xcache);
    noteFreshResponseIfAny(xcache);

    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Disturbances request failed");

    const all = extractDisturbances(data);
    const unplanned = all.filter((d) => !isPlannedDisturbance(d));

    lastDisturbancesAll = all;
    lastDisturbancesUnplanned = unplanned;

    setDisturbancePill(unplanned.length);
  }

  async function refreshDisturbancesSafe() {
    if (!disturbancePill) return;
    try {
      await fetchDisturbances();
    } catch (e) {
      setDisturbancePill(NaN);
      console.warn("Disturbances failed:", e);
    }
  }

  if (disturbancePill) {
    disturbancePill.addEventListener("click", async () => {
      try {
        modalTitle.textContent = t("disturbances");
        modalPill.textContent = "…";
        modalBody.innerHTML = '<div class="muted">' + t("loading") + '</div>';
        openOverlay();

        try {
          await fetchDisturbances();
        } catch (_e) {}

        renderDisturbancesOverlay(
          lastDisturbancesUnplanned,
          lastDisturbancesUnplanned.length,
          lastDisturbancesAll
        );
      } catch (e) {
        modalPill.textContent = "error";
        modalBody.innerHTML =
          '<div class="muted">Error: ' + escapeHtml(e.message) + "</div>";
      }
    });
  }

  /* ---- Search liveboard (DEPARTURES ONLY) ---- */
  async function searchLiveboard() {
    try {
      if (!selected) return alert(t("stationAlert"));

      const arrdep = "departure";

      const prettyDate = datePrettyEl.value.trim();
      const dateIRail = prettyDate ? prettyToIRailDate(prettyDate) : "";

      const prettyTime = timePrettyEl.value.trim();
      const timeIRail = prettyTime ? prettyToIRailTime(prettyTime) : "";

      if (prettyTime && !isValidTimePretty(prettyTime)) {
        return alert(t("timeAlert"));
      }

      board.innerHTML = '<div class="muted">' + t("loading") + '</div>';
      setStatus(t("loading"), "loading");

      let url =
        "/api/liveboard?id=" +
        encodeURIComponent(selected.id) +
        "&arrdep=" +
        encodeURIComponent(arrdep) +
        "&lang=" +
        encodeURIComponent(getLanguage()) +
        "&alerts=false";

      if (dateIRail) url += "&date=" + encodeURIComponent(dateIRail);
      if (timeIRail) url += "&time=" + encodeURIComponent(timeIRail);

      const r = await fetch(url);

      const xcache = r.headers.get("X-Cache");
      updateBannerFromXCache(xcache);
      noteFreshResponseIfAny(xcache);

      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Liveboard failed");
      rememberRecentStation(selected);

      const deps =
        data.departures && data.departures.departure
          ? data.departures.departure
          : [];

      const title = data.station || selected.name || t("title");
      const modeLabel = t("departures");

      let momentLabel = "";
      if (prettyDate || prettyTime) {
        momentLabel = (prettyDate || "").trim() + (prettyTime ? " " + prettyTime : "");
        momentLabel = momentLabel.trim();
      }

      let html =
        '<div class="headerline">' +
        '<div class="title">' + escapeHtml(title) + "</div>" +
        '<span class="pill">' + modeLabel + "</span>" +
        (momentLabel ? '<span class="pill">' + t("at") + ' ' + escapeHtml(momentLabel) + "</span>" : "") +
        '<span class="muted">' + t("updated") + ' : ' + new Date(data.timestamp * 1000).toLocaleString() + "</span>" +
        "</div>";

      if (!deps.length) {
        html += '<div class="muted" style="margin-top:10px;">' + t("noResults") + "</div>";
        board.innerHTML = html;
        setStatus(t("noResults"));
        return;
      }

      html += '<div class="deps">';
      for (const d of deps.slice(0, 24)) {
        const when = fmtTime(d.time);

        const cancelled = String(d.canceled || "0") === "1";
        const cancelledPill = cancelled ? '<span class="pill tierBad">' + t("cancelled") + '</span>' : "";

        const delayPill = delayPillHtml(d.delay, cancelled);

        const platform = d.platform != null ? String(d.platform) : "?";
        const to = d.direction && d.direction.name ? d.direction.name : d.station || "";

        const trainShort =
          d.vehicleinfo && (d.vehicleinfo.shortname || d.vehicleinfo.name)
            ? d.vehicleinfo.shortname || d.vehicleinfo.name
            : d.vehicle || "";

        const vehicleId =
          d.vehicleinfo && d.vehicleinfo.name ? d.vehicleinfo.name : d.vehicle || "";

        const occName =
          d.occupancy && (d.occupancy.name || d.occupancy["@id"])
            ? d.occupancy.name || ""
            : "unknown";
        const o = normalizeOccName(occName);
        const occCls = occTierClassFromLabel(o.label, "pill");

        html +=
          '<div class="dep">' +
          "<div>" +
          '<div class="when">' + escapeHtml(when) + "</div>" +
          '<div class="meta">' +
          escapeHtml(trainShort) +
          (delayPill ? " " + delayPill : "") +
          (cancelledPill ? " " + cancelledPill : "") +
          "</div>" +
          "</div>" +

          "<div>" +
          '<div class="to">' +
          '<button class="toBtn" type="button" data-vehicle="' + escapeHtml(vehicleId) + '" title="Open train details">' +
          escapeHtml(to) + ' <span class="chev">›</span>' +
          "</button>" +
          "</div>" +
          '<div class="meta"><span class="' + occCls + '">' + t("occupancy") + ': ' + escapeHtml(o.label) + "</span></div>" +
          "</div>" +

          '<div class="right">' +
          '<div class="platform-badge">' +
          '<div class="label">' + t("platform") + '</div>' +
          '<div class="num">' + escapeHtml(platform) + "</div>" +
          "</div>" +
          "</div>" +
          "</div>";
      }
      html += "</div>";

      board.innerHTML = html;

      const btns = board.querySelectorAll(".toBtn");
      btns.forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            const vid = btn.getAttribute("data-vehicle") || "";
            if (!vid) return;
            await loadVehicleDetails(vid);
          } catch (e) {
            modalPill.textContent = "error";
            modalBody.innerHTML = '<div class="muted">Error: ' + escapeHtml(e.message) + "</div>";
          }
        });
      });

      setStatus(t("ok"));
    } catch (e) {
      board.innerHTML = '<div class="muted">Error: ' + escapeHtml(e.message) + "</div>";
      setStatus(t("error"), "error");
    }
  }

  /* ---- Init ---- */
  setNow();
  setStatus(t("ready"));
  updateBannerFromNavigator();

  // Disturbances: load once + refresh periodically
  refreshDisturbancesSafe();
  setInterval(refreshDisturbancesSafe, 60_000);
})();
