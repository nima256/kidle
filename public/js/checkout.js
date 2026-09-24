/* Checkout: inline validation, smart address defaults, single-submit payment. */
(function () {
  "use strict";
  var K = window.KIDLE, $ = K.$, $$ = K.$$;
  var form = $("[data-checkout-form]");
  if (!form) return;
  var cities = JSON.parse($("#cities-data").textContent);
  var province = $("#province"), list = $("#city-list");

  function fillCities() {
    list.innerHTML = (cities[province.value] || []).map(function (c) { return '<option value="' + K.esc(c) + '">'; }).join("");
  }
  province.addEventListener("change", function () { fillCities(); $("#city").value = ""; });
  fillCities();

  var edit = $("[data-edit-address]");
  if (edit) edit.addEventListener("click", function () {
    $("[data-saved-address]").hidden = true;
    $("[data-address-fields]").hidden = false;
    $("#address").focus();
  });

  function setErr(name, msg) {
    var p = $('[data-err="' + name + '"]'), input = form.elements[name];
    if (p) { p.hidden = !msg; p.innerHTML = msg ? K.icon("alert", "icon-sm") + " " + K.esc(msg) : ""; }
    if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
  }

  var rules = {
    recipientName: function (v) { return v.trim().length >= 3 ? "" : "نام و نام خانوادگی گیرنده را کامل وارد کنید"; },
    recipientPhone: function (v) { var s = K.toEn(v).replace(/\D/g, ""); if (/^9\d{9}$/.test(s)) s = "0" + s; return /^09\d{9}$/.test(s) ? "" : "شماره موبایل ۱۱ رقمی و با ۰۹ شروع می‌شود"; },
    province: function (v) { return v ? "" : "استان را انتخاب کنید"; },
    city: function (v) { return v.trim().length >= 2 ? "" : "شهر را وارد کنید"; },
    address: function (v) { return v.trim().length >= 10 ? "" : "آدرس را کامل‌تر بنویسید (خیابان، کوچه، پلاک، واحد)"; },
    postcode: function (v) { v = K.toEn(v).replace(/\D/g, ""); return !v || v.length === 10 ? "" : "کد پستی ۱۰ رقم است"; },
  };

  form.addEventListener("blur", function (e) {
    var r = rules[e.target.name];
    if (r && e.target.value) setErr(e.target.name, r(e.target.value));
  }, true);
  form.addEventListener("input", function (e) {
    if (e.target.getAttribute("aria-invalid") === "true" && rules[e.target.name]) setErr(e.target.name, rules[e.target.name](e.target.value));
  });

  // Error summary (focusable, links to each invalid field) complements the inline errors.
  var summary = $("#error-summary"), summaryList = $("[data-error-list]");
  var LABELS = { recipientName: "نام گیرنده", recipientPhone: "موبایل گیرنده", province: "استان", city: "شهر", address: "آدرس", postcode: "کد پستی" };
  function showSummary() {
    var items = Object.keys(rules).map(function (k) {
      var msg = rules[k](form.elements[k].value || "");
      return msg ? '<li><a class="link" href="#' + form.elements[k].id + '" data-jump="' + k + '">' + LABELS[k] + ": " + K.esc(msg) + "</a></li>" : "";
    }).join("");
    summaryList.innerHTML = items;
    summary.hidden = !items;
    if (items) { summary.scrollIntoView({ behavior: "smooth", block: "start" }); summary.focus({ preventScroll: true }); }
  }
  summary.addEventListener("click", function (e) {
    var a = e.target.closest("[data-jump]");
    if (!a) return;
    e.preventDefault();
    var el = form.elements[a.getAttribute("data-jump")];
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  });

  // Draft autosave: an accidental reload or back-navigation doesn't lose a half-typed address.
  var DRAFT = "kidle:checkout-draft";
  var FIELDS = ["recipientName", "recipientPhone", "province", "city", "address", "postcode"];
  try {
    var draft = JSON.parse(sessionStorage.getItem(DRAFT) || "{}");
    FIELDS.forEach(function (k) {
      var el = form.elements[k];
      if (draft[k] && el && !el.value) { el.value = draft[k]; if (k === "province") fillCities(); }
    });
  } catch (e) {}
  form.addEventListener("input", function () {
    try {
      var d = {};
      FIELDS.forEach(function (k) { d[k] = form.elements[k].value; });
      sessionStorage.setItem(DRAFT, JSON.stringify(d));
    } catch (e) {}
  });

  var submitting = false;
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (submitting) return;
    var first = null;
    Object.keys(rules).forEach(function (k) {
      var msg = rules[k](form.elements[k].value || "");
      setErr(k, msg);
      if (msg && !first) first = form.elements[k];
    });
    if (first) {
      if (first.closest("[data-address-fields]") && first.closest("[data-address-fields]").hidden) edit.click();
      showSummary();
      return;
    }
    summary.hidden = true;
    submitting = true;
    var buttons = $$("[data-pay]");
    buttons.forEach(function (b) { K.setLoading(b, true); });
    var body = {};
    new FormData(form).forEach(function (v, k) { body[k] = K.toEn(v); });
    K.api("/api/order/checkout", { method: "POST", body: body })
      .then(function (d) {
        buttons.forEach(function (b) { var l = b.querySelector(".btn-label-idle"); if (l) l.textContent = "در حال انتقال به درگاه…"; });
        try { sessionStorage.removeItem(DRAFT); } catch (e) {}
        location.href = d.redirectUrl;
      })
      .catch(function (err) {
        submitting = false;
        buttons.forEach(function (b) { K.setLoading(b, false); });
        var errors = err.data && err.data.errors;
        if (errors) { Object.keys(errors).forEach(function (k) { setErr(k, errors[k]); }); showSummary(); }
        K.toast(err.message, "error", { duration: 7000 });
        if (err.data && err.data.refresh) setTimeout(function () { location.href = "/cart"; }, 2500);
      });
  });

  // Coming back from the gateway with the browser back button: re-enable the form.
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) { submitting = false; $$("[data-pay]").forEach(function (b) { K.setLoading(b, false); }); }
  });
})();
