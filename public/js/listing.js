/* Listing page: filters (sidebar on desktop, bottom sheet on phones) and sorting. */
(function () {
  "use strict";
  var K = window.KIDLE, $ = K.$, $$ = K.$$;
  var panel = $("#filters"), form = $("[data-filter-form]");
  var desktop = window.matchMedia("(min-width: 64rem)");
  if (!form) return;

  $$("[data-open-filters]").forEach(function (b) {
    b.addEventListener("click", function () { K.open("filters", { focus: ".sheet-body input" }); });
  });
  panel.addEventListener("click", function (e) { if (e.target === panel) K.close(); });

  // Remove empty fields so URLs stay clean.
  form.addEventListener("submit", function () {
    $$("input", form).forEach(function (i) {
      if ((i.type === "text" || i.type === "hidden") && !i.value.trim()) i.disabled = true;
      if (i.inputMode === "numeric") i.value = K.toEn(i.value).replace(/[^\d]/g, "");
      if (i.inputMode === "numeric" && !i.value) i.disabled = true;
    });
  });

  var timer, seq = 0, applyBtn = $("[data-apply]", form), countEl = $("[data-count]", form);
  function params() {
    var fd = new FormData(form), p = new URLSearchParams();
    fd.forEach(function (v, k) { v = K.toEn(v).trim(); if (v) p.append(k, v); });
    return p;
  }
  function refreshCount() {
    var my = ++seq, p = params();
    p.set("_count", "1");
    applyBtn.classList.add("is-loading");
    K.api(form.getAttribute("action") + "?" + p.toString())
      .then(function (d) {
        if (my !== seq) return;
        countEl.textContent = K.fa(d.total);
        applyBtn.disabled = d.total === 0;
        applyBtn.lastChild.textContent = d.total === 0 ? " محصول (نتیجه‌ای نیست)" : " محصول";
      })
      .catch(function () {})
      .finally(function () { if (my === seq) applyBtn.classList.remove("is-loading"); });
  }

  form.addEventListener("change", function (e) {
    if (desktop.matches) {
      // Desktop: apply immediately (price waits for the explicit button / Enter).
      if (e.target.name === "min" || e.target.name === "max") return;
      form.requestSubmit();
    } else {
      clearTimeout(timer);
      timer = setTimeout(refreshCount, 250);
    }
  });

  var sort = $("[data-sort]");
  if (sort) sort.addEventListener("change", function () {
    var opt = sort.options[sort.selectedIndex];
    location.href = opt.getAttribute("data-url");
  });
})();
