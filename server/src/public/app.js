// app.js
(function () {
  const q = document.getElementById("q");
  const dropdown = document.getElementById("dropdown");
  const searchBtn = document.getElementById("searchBtn");
  const board = document.getElementById("board");
  const statusPill = document.getElementById("statusPill");

  const arrdepEl = document.getElementById("arrdep");
  const datePrettyEl = document.getElementById("datePretty"); // DD/MM/YYYY
  const timePrettyEl = document.getElementById("timePretty"); // HH:MM
  const btnNow = document.getElementById("btnNow");
  const btnPlus1h = document.getElementById("btnPlus1h");

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

  // Banner “don’t lie yet” state
  let bannerWaitingForFresh = false;

  // vehicle overlay fetch controller (abort on close)
  let vehicleController = null;

  // Body scroll lock while overlay open
  let prevOverflowBody = "";
  let prevOverflowHtml = "";

  function lockScroll() {
    prevOverflowBody = getComputedStyle(document.body).overflow;
    prevOverflowHtml = getComputedStyle(document.documentElement).overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
  }

  function unlockScroll() {
    // Reset inline styles so CSS can take over again
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";

    prevOverflowBody = "";
    prevOverflowHtml = "";
  }

  function setStatus(text, kind = "normal") {
    statusPill.textContent = text;
    statusPill.className = "pill";
    if (kind === "loading") statusPill.style.borderColor = "rgba(47,125,255,.45)";
    else if (kind === "error") statusPill.style.borderColor = "rgba(255,59,48,.55)";
    else statusPill.style.borderColor = "var(--line)";
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

  // Bonus tiny improvement:
  // - Case-insensitive matching (headers often come back uppercase/mixed)
  // - If header missing, hide banner so it won't get "stuck"
  function updateBannerFromXCache(xcache) {
    const raw = String(xcache || "").trim();
    if (!raw) {
      // If there is no X-Cache header, don't keep stale banner hanging around.
      // (This can happen if some intermediate strips headers.)
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

    // We're back online, but don't lie yet — wait for a fresh (non-STALE) response.
    // Keep any existing banner until the next request confirms freshness.
    if (bannerWaitingForFresh) {
      showBanner("Back online — verifying live data…");
    }
  }

  window.addEventListener("offline", updateBannerFromNavigator);
  window.addEventListener("online", updateBannerFromNavigator);

  function openDropdown() {
    dropdown.classList.add("open");
  }
  function closeDropdown() {
    dropdown.classList.remove("open");
    activeIdx = -1;
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
      div.innerHTML =
        '<div><div class="dd-name">' +
        escapeHtml(s.name) +
        "</div></div>" +
        '<div class="dd-id">' +
        escapeHtml(s.id) +
        "</div>";
      div.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pickResult(i);
      });
      dropdown.appendChild(div);
    }
    openDropdown();
  }

  function highlightActive() {
    const items = dropdown.querySelectorAll(".dd-item");
    items.forEach((el, idx) => {
      el.style.background = idx === activeIdx ? "rgba(255,255,255,.08)" : "";
    });
  }

  function pickResult(idx) {
    const s = lastResults[idx];
    if (!s) return;
    selected = { id: s.id, name: s.name };
    q.value = s.name;
    closeDropdown();
    setStatus("selected");
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

  function normalizeOccName(occ) {
    const n = String(occ || "unknown").toLowerCase();
    if (n.includes("low")) return { label: "low", cls: "occ-low" };
    if (n.includes("medium")) return { label: "medium", cls: "occ-med" };
    if (n.includes("high")) return { label: "high", cls: "occ-high" };
    return { label: "unknown", cls: "occ-unk" };
  }

  /* ---- Delay tier helpers (liveboard + vehicle overlay) ---- */

  // returns minutes OR null if delay info missing
  // rule: if delay seconds is 1..59 => show 1 minute (clarity)
  function delayMinutesFromSeconds(delaySeconds) {
    if (delaySeconds == null) return null; // no info => remove pill
    const s = Number(delaySeconds);
    if (!Number.isFinite(s)) return null;

    const abs = Math.abs(s);

    if (abs > 0 && abs < 60) return 1;
    return Math.round(abs / 60);
  }

  // tier for delay minutes
  // ok: 0
  // warn: 1..5
  // bad: 6+ OR cancelled
  // null: no info
  function delayTier(mins, cancelled) {
    if (cancelled) return "bad";
    if (mins == null) return null; // no info
    if (mins <= 0) return "ok";
    if (mins <= 5) return "warn";
    return "bad";
  }

  // Liveboard pill (uses .delayOk / .delayWarn / .delayBad)
  // - If no delay info => no pill
  // - If cancelled => handled separately by caller
  function delayPillHtml(delaySeconds, cancelled) {
    if (cancelled) return "";

    const mins = delayMinutesFromSeconds(delaySeconds);
    const tier = delayTier(mins, false);
    if (!tier) return ""; // no info

    if (tier === "ok") {
      return '<span class="pill delayOk">0</span>';
    }
    if (tier === "warn") {
      return '<span class="pill delayWarn">+' + mins + "m</span>";
    }
    return '<span class="pill delayBad">+' + mins + "m</span>";
  }

  /* ---- Pretty input formatting ---- */
  function formatDatePrettyOnInput() {
    const digits = datePrettyEl.value.replace(/\D/g, "").slice(0, 8);
    let out = "";
    for (let i = 0; i < digits.length; i++) {
      out += digits[i];
      if (i === 1 || i === 3) out += "/";
    }
    datePrettyEl.value = out;
  }

  function formatTimePrettyOnInput() {
    const digits = timePrettyEl.value.replace(/\D/g, "").slice(0, 4);
    let out = "";
    for (let i = 0; i < digits.length; i++) {
      out += digits[i];
      if (i === 1) out += ":";
    }
    timePrettyEl.value = out;
  }

  function prettyToIRailDate(ddmmyyyy) {
    const m = String(ddmmyyyy || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return "";
    const dd = m[1],
      mm = m[2],
      yyyy = m[3];
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

  /* ---- Now + +1h based on selected moment ---- */
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

  datePrettyEl.addEventListener("input", formatDatePrettyOnInput);
  timePrettyEl.addEventListener("input", formatTimePrettyOnInput);

  btnNow.addEventListener("click", () => setNow());
  btnPlus1h.addEventListener("click", () => {
    const base = getSelectedMomentLocal();
    base.setHours(base.getHours() + 1);
    setMomentLocal(base);
  });

  /* ---- Autocomplete ---- */
  async function searchStationsAuto() {
    const term = q.value.trim();
    selected = null;

    if (term.length < 2) {
      dropdown.innerHTML = "";
      closeDropdown();
      setStatus("ready");
      return;
    }

    if (inFlight && typeof inFlight.abort === "function") inFlight.abort();
    const controller = new AbortController();
    inFlight = controller;

    setStatus("searching…", "loading");

    const r = await fetch(
      "/api/stations/search?q=" + encodeURIComponent(term) + "&limit=12",
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
    setStatus(lastResults.length ? "pick station" : "no matches");
  }

  function debounceSearch() {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      searchStationsAuto().catch((e) => {
        setStatus("search error", "error");
        closeDropdown();
        console.error(e);
      });
    }, 180);
  }

  q.addEventListener("input", debounceSearch);
  q.addEventListener("focus", () => {
    if (lastResults.length) openDropdown();
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

    if (e.key === "Enter" && !dropdown.classList.contains("open")) {
      searchBtn.click();
    }
  });

  /* ---- Overlay helpers ---- */
  function openOverlay() {
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    lockScroll();
  }

  function closeOverlay() {
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    modalTitle.textContent = "Train details";
    modalPill.textContent = "vehicle";
    modalBody.innerHTML = '<div class="muted">Closed.</div>';

    if (vehicleController) {
      try {
        vehicleController.abort();
      } catch (_e) {}
      vehicleController = null;
    }

    unlockScroll();
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
    let cls = "miniPill";
    if (o.label === "low") cls += " miniOk";
    else if (o.label === "medium") cls += " miniWarn";
    else if (o.label === "high") cls += " miniDelay";
    return '<span class="' + cls + '">occupancy: ' + o.label + "</span>";
  }

  // Vehicle overlay delay pill (uses .miniDelayOk / .miniDelayWarn / .miniDelayBad)
  // - cancelled => red "cancelled"
  // - no info => no pill
  function delayMini(delaySeconds, cancelled) {
    if (cancelled) return '<span class="miniPill miniDelayBad">cancelled</span>';

    const mins = delayMinutesFromSeconds(delaySeconds);
    if (mins == null) return ""; // no info => no pill

    const tier = delayTier(mins, false);
    if (!tier) return "";

    if (tier === "ok") return '<span class="miniPill miniDelayOk">0</span>';
    if (tier === "warn") return '<span class="miniPill miniDelayWarn">+' + mins + "m</span>';
    return '<span class="miniPill miniDelayBad">+' + mins + "m</span>';
  }

  function extraStopMini(flag) {
    return String(flag || "0") === "1"
      ? '<span class="miniPill miniExtra">extra stop</span>'
      : "";
  }

  async function loadVehicleDetails(vehicleId) {
    const prettyDate = datePrettyEl.value.trim();
    const dateIRail = prettyDate ? prettyToIRailDate(prettyDate) : "";

    modalTitle.textContent = "Train details";
    modalPill.textContent = "loading…";
    modalBody.innerHTML = '<div class="muted">Loading…</div>';
    openOverlay();

    if (vehicleController) {
      try {
        vehicleController.abort();
      } catch (_e) {}
    }
    vehicleController = new AbortController();

    let url =
      "/api/vehicle?id=" +
      encodeURIComponent(vehicleId) +
      "&lang=en&alerts=false";
    if (dateIRail) url += "&date=" + encodeURIComponent(dateIRail);

    const r = await fetch(url, { signal: vehicleController.signal });

    // Read X-Cache (vehicle)
    const xcache = r.headers.get("X-Cache");
    updateBannerFromXCache(xcache);
    noteFreshResponseIfAny(xcache);

    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Vehicle request failed");

    const vinfo = data.vehicleinfo || {};
    const short = vinfo.shortname || vinfo.name || data.vehicle || vehicleId;

    modalTitle.textContent = short;
    modalPill.textContent = "stops";

    const stops = data.stops && data.stops.stop ? data.stops.stop : [];
    if (!stops.length) {
      modalBody.innerHTML =
        '<div class="muted">No stop list available for this vehicle.</div>' +
        '<div class="muted" style="margin-top:6px;">Tip: try a date closer to “now”.</div>';
      return;
    }

    let html = "";
    html += '<div class="row" style="gap:8px; align-items:center;">';
    html += '<span class="pill">vehicle</span>';
    html +=
      '<span class="pill">' + escapeHtml(String(stops.length)) + " stops</span>";
    if (data.timestamp) {
      html +=
        '<span class="muted">updated: ' +
        new Date(data.timestamp * 1000).toLocaleString() +
        "</span>";
    }
    html += "</div>";

    html += '<div class="stops">';
    for (const s of stops) {
      const station =
        s.station ||
        (s.stationinfo &&
          (s.stationinfo.name || s.stationinfo.standardname)) ||
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

      const depLine = depT
        ? "Dep " + escapeHtml(depT)
        : fallbackT
        ? "Dep " + escapeHtml(fallbackT)
        : "Dep —";
      const arrLine = arrT ? "Arr " + escapeHtml(arrT) : "Arr —";

      // IMPORTANT: pass through as provided; helper handles null vs jitter
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
      const p = '<span class="miniPill">pl ' + escapeHtml(platform) + "</span>";

      html += '<div class="stopRow">';
      html += "<div>";
      html += '<div class="stopTime">' + depLine + "</div>";
      html +=
        '<div class="stopMeta">' +
        p +
        depBadges +
        extraStopMini(s.isExtraStop) +
        "</div>";
      html +=
        '<div class="stopMeta" style="margin-top:6px;">' +
        '<span class="miniPill">' +
        arrLine +
        "</span>" +
        arrBadges +
        "</div>";
      html += "</div>";

      html += "<div>";
      html += '<div class="stopStation">' + escapeHtml(station) + "</div>";
      html += '<div class="stopMeta">' + occMini(occ) + "</div>";
      html += "</div>";

      html += '<div style="justify-self:end; text-align:right;">';
      html +=
        '<span class="miniPill">platform ' + escapeHtml(platform) + "</span>";
      html += "</div>";
      html += "</div>";
    }
    html += "</div>";

    modalBody.innerHTML = html;
  }

  /* ---- Search liveboard ---- */
  searchBtn.addEventListener("click", async () => {
    try {
      if (!selected && lastResults.length) pickResult(0);
      if (!selected) return alert("Pick a station from the dropdown first");

      const arrdep = arrdepEl.value;

      const prettyDate = datePrettyEl.value.trim();
      const dateIRail = prettyDate ? prettyToIRailDate(prettyDate) : "";

      const prettyTime = timePrettyEl.value.trim();
      const timeIRail = prettyTime ? prettyToIRailTime(prettyTime) : "";

      if (prettyTime && !isValidTimePretty(prettyTime)) {
        return alert("Time must be HH:MM (e.g. 07:30, 23:15).");
      }

      board.innerHTML = '<div class="muted">Loading…</div>';
      setStatus("loading…", "loading");

      let url =
        "/api/liveboard?id=" +
        encodeURIComponent(selected.id) +
        "&arrdep=" +
        encodeURIComponent(arrdep) +
        "&lang=en&alerts=false";

      if (dateIRail) url += "&date=" + encodeURIComponent(dateIRail);
      if (timeIRail) url += "&time=" + encodeURIComponent(timeIRail);

      const r = await fetch(url);

      // Read X-Cache (liveboard) — once
      const xcache = r.headers.get("X-Cache");
      updateBannerFromXCache(xcache);
      noteFreshResponseIfAny(xcache);

      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Liveboard failed");

      const deps =
        data.departures && data.departures.departure
          ? data.departures.departure
          : [];
      const title = data.station || selected.name || "Station";
      const modeLabel = arrdep === "arrival" ? "arrivals" : "departures";

      let momentLabel = "";
      if (prettyDate || prettyTime) {
        momentLabel =
          (prettyDate || "").trim() + (prettyTime ? " " + prettyTime : "");
        momentLabel = momentLabel.trim();
      }

      let html =
        '<div class="headerline">' +
        '<div class="title">' +
        escapeHtml(title) +
        "</div>" +
        '<span class="pill">' +
        modeLabel +
        "</span>" +
        (momentLabel
          ? '<span class="pill">at ' + escapeHtml(momentLabel) + "</span>"
          : "") +
        '<span class="muted">updated: ' +
        new Date(data.timestamp * 1000).toLocaleString() +
        "</span>" +
        "</div>";

      if (!deps.length) {
        html +=
          '<div class="muted" style="margin-top:10px;">No ' +
          modeLabel +
          " found for this moment.</div>";
        board.innerHTML = html;
        setStatus("no results");
        return;
      }

      html += '<div class="deps">';
      for (const d of deps.slice(0, 24)) {
        const when = fmtTime(d.time);

        const cancelled = String(d.canceled || "0") === "1";
        const cancelledPill = cancelled
          ? '<span class="pill delayBad">cancelled</span>'
          : "";

        const delayPill = delayPillHtml(d.delay, cancelled);

        const platform = d.platform != null ? String(d.platform) : "?";

        const to =
          d.direction && d.direction.name ? d.direction.name : d.station || "";

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
        const occ = normalizeOccName(occName);

        html +=
          '<div class="dep">' +
          "<div>" +
          '<div class="when">' +
          escapeHtml(when) +
          "</div>" +
          '<div class="meta">' +
          escapeHtml(trainShort) +
          (delayPill ? " " + delayPill : "") +
          (cancelledPill ? " " + cancelledPill : "") +
          "</div>" +
          "</div>" +
          "<div>" +
          '<div class="to">' +
          '<button class="toBtn" type="button" data-vehicle="' +
          escapeHtml(vehicleId) +
          '" title="Open train details">' +
          escapeHtml(to) +
          ' <span class="chev">›</span>' +
          "</button>" +
          "</div>" +
          '<div class="meta"><span class="pill ' +
          occ.cls +
          '">occupancy: ' +
          occ.label +
          "</span></div>" +
          "</div>" +
          '<div class="right">' +
          '<div class="platform-badge">' +
          '<div class="label">PLATFORM</div>' +
          '<div class="num">' +
          escapeHtml(platform) +
          "</div>" +
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
            modalBody.innerHTML =
              '<div class="muted">Error: ' + escapeHtml(e.message) + "</div>";
            openOverlay();
          }
        });
      });

      setStatus("ok");
    } catch (e) {
      board.innerHTML =
        '<div class="muted">Error: ' + escapeHtml(e.message) + "</div>";
      setStatus("error", "error");
    }
  });

  /* ---- Init ---- */
  setNow();
  setStatus("ready");
  updateBannerFromNavigator(); // initial check
})();
