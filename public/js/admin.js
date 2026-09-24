/* Admin panel helpers: JSON forms, action buttons, repeatable rows, image uploads, rich text. */
(function () {
  "use strict";
  var K = window.KIDLE, $ = K.$, $$ = K.$$;

  /* ── Serialize a form to JSON ──
     name="a"            → a
     name="tags[]"       → array of values (checked checkboxes / all inputs)
     type=checkbox       → boolean (unless name ends with [])
     [data-repeat=name]  → array of rows; inputs inside rows use data-field="key"
     [data-images=name]  → array of {url, filename, alt}                                          */
  K.serialize = function (form) {
    var out = {};
    $$("input[name], select[name], textarea[name]", form).forEach(function (el) {
      if (el.disabled || el.closest("[data-repeat]") || el.closest("[data-images]")) return;
      var name = el.name;
      if (name.slice(-2) === "[]") {
        name = name.slice(0, -2);
        out[name] = out[name] || [];
        if ((el.type === "checkbox" || el.type === "radio") && !el.checked) return;
        if (el.value) out[name].push(el.value);
        return;
      }
      if (el.type === "checkbox") { out[name] = el.checked; return; }
      if (el.type === "radio") { if (el.checked) out[name] = el.value; return; }
      out[name] = el.value;
    });
    $$("[data-repeat]", form).forEach(function (box) {
      out[box.getAttribute("data-repeat")] = $$("[data-row]", box).map(function (row) {
        var o = {};
        $$("[data-field]", row).forEach(function (i) { o[i.getAttribute("data-field")] = i.value; });
        return o;
      });
    });
    $$("[data-images]", form).forEach(function (box) {
      out[box.getAttribute("data-images")] = $$("[data-image]", box).map(function (t) {
        return { url: t.getAttribute("data-url"), filename: t.getAttribute("data-filename"), alt: ($("input", t) || {}).value || "" };
      });
    });
    $$("[data-rich]", form).forEach(function (ed) {
      if (ed._quill) out[ed.getAttribute("data-rich")] = ed._quill.root.innerHTML;
    });
    return out;
  };

  function showErrors(form, errors) {
    $$("[data-err]", form).forEach(function (p) { p.hidden = true; });
    $$("[aria-invalid]", form).forEach(function (i) { i.removeAttribute("aria-invalid"); });
    var first = null;
    Object.keys(errors || {}).forEach(function (k) {
      var p = $('[data-err="' + k + '"]', form);
      if (p) { p.hidden = false; p.textContent = errors[k]; }
      var input = form.querySelector('[name="' + k + '"], [name="' + k + '[]"]');
      if (input) { input.setAttribute("aria-invalid", "true"); if (!first) first = input; }
    });
    if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  document.addEventListener("submit", function (e) {
    var form = e.target.closest("form[data-api]");
    if (!form) return;
    e.preventDefault();
    var btn = form.querySelector('[type="submit"]:not([form])') || document.querySelector('[form="' + form.id + '"]');
    var body = K.serialize(form);
    K.setLoading(btn, true);
    K.api(form.getAttribute("data-api"), { method: form.getAttribute("data-method") || "POST", body: body })
      .then(function (d) {
        showErrors(form, {});
        K.toast(d.message || "ذخیره شد", "success");
        form.dispatchEvent(new CustomEvent("saved", { detail: d }));
        if (d.redirect && form.hasAttribute("data-follow")) location.href = d.redirect;
        else if (form.hasAttribute("data-reload")) setTimeout(function () { location.reload(); }, 500);
        else if (form.hasAttribute("data-close")) K.close();
      })
      .catch(function (err) {
        showErrors(form, err.data && err.data.errors);
        K.toast(err.message, "error");
      })
      .finally(function () { K.setLoading(btn, false); });
  });

  // Buttons: data-action="/admin/api/..." data-method="DELETE" data-confirm="…" data-body='{"a":1}'
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-action]");
    if (!b) return;
    e.preventDefault();
    var msg = b.getAttribute("data-confirm");
    if (msg && !confirm(msg)) return;
    K.setLoading(b, true);
    var body = b.getAttribute("data-body");
    K.api(b.getAttribute("data-action"), { method: b.getAttribute("data-method") || "POST", body: body ? JSON.parse(body) : {} })
      .then(function (d) {
        K.toast(d.message || "انجام شد", "success");
        if (d.redirect) location.href = d.redirect;
        else if (b.hasAttribute("data-remove-row")) { var tr = b.closest("tr, li, [data-item]"); if (tr) tr.remove(); K.setLoading(b, false); }
        else setTimeout(function () { location.reload(); }, 500);
      })
      .catch(function (err) { K.setLoading(b, false); K.toast(err.message, "error"); });
  });

  // Open an edit sheet pre-filled from data-fill JSON: data-edit="#sheet-id" data-fill='{...}' data-api-url="..."
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-edit]");
    if (!b) return;
    var sheet = $(b.getAttribute("data-edit"));
    var form = $("form", sheet);
    form.reset();
    $$("[data-err]", form).forEach(function (p) { p.hidden = true; });
    var data = JSON.parse(b.getAttribute("data-fill") || "{}");
    Object.keys(data).forEach(function (k) {
      var els = form.querySelectorAll('[name="' + k + '"], [name="' + k + '[]"]');
      Array.prototype.forEach.call(els, function (el) {
        if (el.type === "checkbox" && el.name.slice(-2) === "[]") el.checked = (data[k] || []).indexOf(el.value) !== -1;
        else if (el.type === "checkbox") el.checked = !!data[k];
        else el.value = data[k] == null ? "" : data[k];
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
    form.setAttribute("data-api", b.getAttribute("data-api-url"));
    form.setAttribute("data-method", b.getAttribute("data-api-method") || "POST");
    var t = $("[data-sheet-title]", sheet);
    if (t) t.textContent = b.getAttribute("data-title") || t.textContent;
    K.open(sheet.id, { focus: "input:not([type=hidden])" });
  });

  /* ── Repeatable rows ── */
  document.addEventListener("click", function (e) {
    var add = e.target.closest("[data-add-row]");
    if (add) {
      var box = $('[data-repeat="' + add.getAttribute("data-add-row") + '"]');
      var tpl = $('template[data-template="' + add.getAttribute("data-add-row") + '"]');
      box.appendChild(tpl.content.cloneNode(true));
      var rows = $$("[data-row]", box);
      var f = $("input", rows[rows.length - 1]);
      if (f) f.focus();
    }
    var rm = e.target.closest("[data-remove-row-btn]");
    if (rm) rm.closest("[data-row]").remove();
  });

  /* ── Image uploader ── */
  $$("[data-uploader]").forEach(function (up) {
    var input = $('input[type="file"]', up), box = $("[data-images]", up), single = up.hasAttribute("data-single");
    var folder = up.getAttribute("data-folder") || "product";
    input.addEventListener("change", function () {
      if (!input.files.length) return;
      var fd = new FormData();
      Array.prototype.forEach.call(input.files, function (f) { fd.append("images", f); });
      up.classList.add("opacity-60");
      var status = $("[data-upload-status]", up);
      if (status) status.textContent = "در حال آپلود…";
      fetch("/admin/api/uploads?folder=" + folder, { method: "POST", body: fd, credentials: "same-origin" })
        .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.message || "آپلود انجام نشد"); return d; }); })
        .then(function (d) {
          if (single) box.innerHTML = "";
          d.images.forEach(function (im) { box.insertAdjacentHTML("beforeend", thumb(im.url, im.filename, "", single)); });
          syncSingle(up);
          K.toast("تصویر آپلود شد", "success");
        })
        .catch(function (err) { K.toast(err.message, "error"); })
        .finally(function () { up.classList.remove("opacity-60"); input.value = ""; if (status) status.textContent = ""; });
    });
    up.addEventListener("click", function (e) {
      var t = e.target.closest("[data-image]");
      if (!t) return;
      if (e.target.closest("[data-img-remove]")) { t.remove(); syncSingle(up); }
      if (e.target.closest("[data-img-first]")) { box.prepend(t); }
    });
  });
  function syncSingle(up) {
    var hidden = $("input[data-single-value]", up);
    if (hidden) { var t = $("[data-image]", up); hidden.value = t ? t.getAttribute("data-url") : ""; }
  }
  function thumb(url, filename, alt, single) {
    return '<div class="relative w-28 shrink-0 overflow-hidden rounded-md border border-ink-200 bg-white" data-image data-url="' + K.esc(url) + '" data-filename="' + K.esc(filename) + '">' +
      '<img src="' + K.esc(url) + '" alt="" class="aspect-[4/5] w-full object-cover">' +
      (single ? "" : '<input class="w-full border-t border-ink-100 px-1.5 py-1 text-2xs outline-none" placeholder="متن جایگزین (alt)" value="' + K.esc(alt) + '">') +
      '<div class="absolute top-1 start-1 flex gap-1">' + (single ? "" : '<button type="button" class="rounded bg-white/90 px-1.5 text-2xs font-bold shadow-xs" data-img-first title="تصویر اصلی">اصلی</button>') +
      '<button type="button" class="rounded bg-white/90 px-1 text-danger-600 shadow-xs" data-img-remove aria-label="حذف تصویر">' + K.icon("x", "icon-sm") + "</button></div></div>";
  }
  K.thumb = thumb;

  /* ── Rich text (Quill, RTL) ── */
  window.addEventListener("load", function () {
    if (!window.Quill) return;
    $$("[data-rich]").forEach(function (ed) {
      var src = $("template", ed);
      var host = document.createElement("div");
      ed.appendChild(host);
      host.innerHTML = src ? src.innerHTML : "";
      ed._quill = new window.Quill(host, {
        theme: "snow",
        modules: { toolbar: [[{ header: [2, 3, false] }], ["bold", "italic", "underline"], [{ list: "ordered" }, { list: "bullet" }], ["link", "blockquote"], [{ align: [] }, { direction: "rtl" }], ["clean"]] },
      });
      ed._quill.format("direction", "rtl");
      ed._quill.format("align", "right");
    });
  });

  document.addEventListener("change", function (e) {
    if (e.target.matches("[data-autosubmit]")) e.target.form.submit();
  });

  /* ── Inline stock adjust (inventory page) ── */
  document.addEventListener("submit", function (e) {
    var f = e.target.closest("form[data-stock]");
    if (!f) return;
    e.preventDefault();
    var delta = parseInt(K.toEn(f.delta.value).replace(/[^\d+-]/g, ""), 10);
    if (!delta) { K.toast("عدد مثبت (ورود کالا) یا منفی (خروج) وارد کنید", "error"); return; }
    var btn = $("button", f);
    K.setLoading(btn, true);
    K.api(f.getAttribute("data-stock"), { method: "PATCH", body: { delta: delta } })
      .then(function (d) {
        K.toast(d.message, "success");
        var cell = f.closest("tr").querySelector("[data-stock-value]");
        cell.textContent = K.fa(d.stock);
        f.delta.value = "";
      })
      .catch(function (err) { K.toast(err.message, "error"); })
      .finally(function () { K.setLoading(btn, false); });
  });
})();
