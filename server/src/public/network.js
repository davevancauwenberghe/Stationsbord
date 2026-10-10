import { escapeHtml as h, isPlanned, safeLink } from "./rail-utils.js?v=0.9.2";

function renderNotice(item, t) {
  const link = safeLink(item.link),
    attachment = safeLink(item.attachment);
  return `<article class="disturbance"><h3>${h(item.title || t("disturbance"))}</h3><p>${h(item.description || "")}</p>${link ? `<a href="${h(link)}" target="_blank" rel="noopener noreferrer">${h(t("moreInfo"))} ↗</a>` : ""}${attachment ? `<a href="${h(attachment)}" target="_blank" rel="noopener noreferrer">${h(t("attachment"))} ↗</a>` : ""}</article>`;
}

export function renderNetwork(list, t, stale = false) {
  // iRail's type field distinguishes scheduled works from unscheduled issues.
  const issues = list.filter((item) => !isPlanned(item));
  const works = list.filter(isPlanned);
  return `${stale ? `<div class="notice">${h(t(list.length ? "stale" : "networkUnknown"))}</div>` : ""}<section class="network-issues" aria-labelledby="networkIssuesTitle"><h3 id="networkIssuesTitle" class="section-title">${h(t("currentDisruptions"))}${issues.length ? ` <span class="network-count">${issues.length}</span>` : ""}</h3>${issues.length ? issues.map((item) => renderNotice(item, t)).join("") : `<p class="muted">${h(t(stale ? "networkUnknown" : "networkClear"))}</p>`}</section>${works.length ? `<details class="network-works"><summary>${h(t("works"))} <span class="network-count">${works.length}</span></summary><div>${works.map((item) => renderNotice(item, t)).join("")}</div></details>` : ""}`;
}
