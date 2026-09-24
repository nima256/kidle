/* Product page: gallery, option selection, add to cart, reviews. */
(function () {
  "use strict";
  var K = window.KIDLE, $ = K.$, $$ = K.$$;
  var root = $("[data-product]");
  if (!root) return;
  var productId = root.getAttribute("data-product");

  /* ── Gallery ── */
  var gallery = $("[data-gallery]"), dots = $$("[data-dot]"), thumbs = $$("[data-thumb]");
  function current() { return gallery ? Math.round(Math.abs(gallery.scrollLeft) / gallery.clientWidth) : 0; }
  function goTo(i) {
    if (!gallery) return;
    var n = gallery.children.length;
    i = (i + n) % n;
    // RTL: scrollLeft is negative in modern browsers.
    gallery.scrollTo({ left: -i * gallery.clientWidth, behavior: "smooth" });
  }
  function sync() {
    var i = current();
    dots.forEach(function (d, j) { d.classList.toggle("w-4", i === j); d.classList.toggle("!bg-brand-500", i === j); d.classList.toggle("w-1.5", i !== j); });
    thumbs.forEach(function (t, j) { t.classList.toggle("border-brand-500", i === j); t.classList.toggle("border-transparent", i !== j); t.setAttribute("aria-selected", i === j); });
  }
  if (gallery) {
    var st;
    gallery.addEventListener("scroll", function () { clearTimeout(st); st = setTimeout(sync, 60); }, { passive: true });
    thumbs.forEach(function (t) { t.addEventListener("click", function () { goTo(+t.getAttribute("data-thumb")); }); });
    var prev = $("[data-gallery-prev]"), next = $("[data-gallery-next]");
    if (prev) prev.addEventListener("click", function () { goTo(current() - 1); });
    if (next) next.addEventListener("click", function () { goTo(current() + 1); });
    gallery.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); goTo(current() + 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); goTo(current() - 1); }
    });
    $$("[data-zoom]").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = +b.getAttribute("data-zoom");
        K.open("zoom");
        var track = $("[data-zoom-track]");
        requestAnimationFrame(function () { track.scrollTo({ left: -i * track.clientWidth }); });
      });
    });
  }

  /* ── Options ── */
  var form = $("[data-buy-form]");
  function err(name, msg) {
    var p = $('[data-error-for="' + name + '"]', form.closest("section") || document);
    if (!p) return;
    p.hidden = !msg;
    p.innerHTML = msg ? K.icon("alert", "icon-sm") + " " + K.esc(msg) : "";
  }
  if (form) {
    form.addEventListener("change", function (e) {
      if (e.target.name === "size") {
        var u = e.target.getAttribute("data-usage");
        $("[data-size-label]").textContent = e.target.value + (u ? " — " + u : "");
        err("size", "");
      }
      if (e.target.name === "color") { $("[data-color-label]").textContent = e.target.value; err("color", ""); }
    });

    var qtyBox = $("[data-qty]");
    if (qtyBox) {
      var input = $("input", qtyBox), max = +qtyBox.getAttribute("data-max") || 1;
      qtyBox.addEventListener("click", function (e) {
        var b = e.target.closest("[data-step]");
        if (!b) return;
        var v = Math.min(max, Math.max(1, (+input.value || 1) + +b.getAttribute("data-step")));
        input.value = v;
        $('[data-step="-1"]', qtyBox).disabled = v <= 1;
        $('[data-step="1"]', qtyBox).disabled = v >= max;
        if (v >= max && max > 1) K.toast("حداکثر تعداد قابل سفارش " + K.fa(max) + " عدد است", "info");
      });
      if (max <= 1) $('[data-step="1"]', qtyBox).disabled = true;
    }
  }

  function validate() {
    var ok = true, first = null;
    ["color", "size"].forEach(function (name) {
      var group = form.querySelectorAll('input[name="' + name + '"]');
      if (!group.length) return;
      if (!form.querySelector('input[name="' + name + '"]:checked')) {
        ok = false;
        err(name, name === "size" ? "لطفاً سایز را انتخاب کنید" : "لطفاً رنگ را انتخاب کنید");
        if (!first) first = group[0];
      }
    });
    if (first) {
      first.closest("fieldset").scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(function () { first.focus({ preventScroll: true }); }, 300);
    }
    return ok;
  }

  function add(btn, thenGo) {
    if (!validate()) return;
    var fd = new FormData(form);
    K.setLoading(btn, true);
    K.api("/api/cart/items", {
      method: "POST",
      body: { productId: productId, quantity: +fd.get("quantity") || 1, color: fd.get("color") || "", size: fd.get("size") || "" },
    })
      .then(function (d) {
        K.setCartCount(d.cartCount);
        if (thenGo) { location.href = K.user ? "/checkout" : "/cart"; return; }
        K.toast("به سبد خرید اضافه شد", "success", { action: { href: "/cart", label: "مشاهده سبد" } });
      })
      .catch(function (e) {
        K.toast(e.message, "error");
        if (e.data && e.data.field === "سایز") err("size", e.message);
      })
      .finally(function () { K.setLoading(btn, false); });
  }

  if (form) {
    form.addEventListener("submit", function (e) { e.preventDefault(); add($("[data-add]", form)); });
    var buyNow = $("[data-buy-now]");
    if (buyNow) buyNow.addEventListener("click", function () { add(buyNow, true); });
    var mobileAdd = $("[data-add-mobile]");
    if (mobileAdd) mobileAdd.addEventListener("click", function () { add(mobileAdd); });
  }

  var sg = $("[data-open-size-guide]");
  if (sg) sg.addEventListener("click", function () { K.open("size-guide"); });

  /* ── Description collapse ── */
  var coll = $("[data-collapsible]"), exp = $("[data-expand]");
  if (coll && exp) {
    if (coll.scrollHeight > coll.clientHeight + 24) {
      exp.hidden = false;
      coll.classList.add("after:absolute", "after:inset-x-0", "after:bottom-0", "after:h-16", "after:bg-gradient-to-t", "after:from-paper");
      exp.addEventListener("click", function () {
        coll.classList.remove("max-h-72", "after:absolute");
        exp.hidden = true;
      });
    } else coll.classList.remove("max-h-72");
  }

  /* ── Reviews ── */
  var rv = $("[data-reviews]"), page = 1, pages = 1, mine = null;
  var summary = $("[data-review-summary]"), list = $("[data-review-list]"), more = $("[data-review-more]");
  function stars(n, cls) {
    var h = "";
    for (var i = 1; i <= 5; i++) h += K.icon("star", "icon-fill " + (cls || "icon-sm") + (i <= Math.round(n) ? " text-butter-400" : " text-ink-200"));
    return '<span class="flex" aria-label="' + n + ' از ۵">' + h + "</span>";
  }
  function renderSummary(d) {
    if (!d.total) {
      summary.innerHTML = '<div class="flex flex-col items-center gap-2 py-3 text-center"><span class="empty-art !size-14">' + K.icon("message", "icon-lg") + '</span><p class="text-sm font-semibold">هنوز نظری ثبت نشده است</p><p class="text-xs text-ink-500">اگر این محصول را خریده‌اید، تجربه‌تان را با بقیه والدین به اشتراک بگذارید.</p></div>';
    } else {
      var bars = d.distribution.map(function (r) {
        var pct = d.total ? Math.round((r.count / d.total) * 100) : 0;
        return '<div class="flex items-center gap-2 text-xs"><span class="w-3">' + K.fa(r.rating) + '</span><span class="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100"><span class="block h-full rounded-full bg-butter-400" style="width:' + pct + '%"></span></span><span class="w-6 text-ink-500">' + K.fa(r.count) + "</span></div>";
      }).join("");
      summary.innerHTML = '<div class="flex items-center gap-5"><div class="text-center"><p class="text-3xl font-black">' + K.fa(d.average) + '</p>' + stars(d.average) + '<p class="mt-1 text-2xs text-ink-500">' + K.fa(d.total) + ' نظر</p></div><div class="flex-1 space-y-1">' + bars + "</div></div>";
    }
    if (d.mine) {
      var s = { pending: ["badge-info", "در انتظار تأیید"], approved: ["badge-success", "منتشر شده"], rejected: ["badge-danger", "تأیید نشد"] }[d.mine.status];
      summary.insertAdjacentHTML("beforeend", '<div class="mt-3 flex items-center justify-between gap-2 rounded-md bg-ink-50 p-2.5 text-xs"><span>نظر شما: <span class="badge ' + s[0] + '">' + s[1] + '</span></span><span class="flex gap-1"><button type="button" class="btn btn-ghost btn-sm" data-write-review>ویرایش</button><button type="button" class="btn btn-ghost btn-sm text-danger-600" data-delete-review>حذف</button></span></div>');
    }
  }
  function renderItems(items, append) {
    var h = items.map(function (r) {
      return '<article class="card p-3.5"><div class="flex items-center justify-between gap-2"><p class="text-sm font-bold">' + K.esc(r.authorName || "مشتری کیدل") +
        (r.verifiedBuyer ? ' <span class="badge badge-success ms-1">' + K.icon("check", "icon-sm") + "خریدار</span>" : "") + "</p>" + stars(r.rating) + "</div>" +
        '<p class="mt-2 text-sm leading-7 whitespace-pre-line text-ink-800">' + K.esc(r.text) + '</p><p class="mt-1 text-2xs text-ink-500">' + new Date(r.createdAt).toLocaleDateString("fa-IR") + "</p></article>";
    }).join("");
    if (append) list.insertAdjacentHTML("beforeend", h); else list.innerHTML = h;
  }
  function load(p) {
    more.classList.add("is-loading");
    return K.api("/api/products/" + productId + "/reviews?page=" + p)
      .then(function (d) {
        page = d.page; pages = d.pages; mine = d.mine;
        if (p === 1) renderSummary(d);
        renderItems(d.reviews, p > 1);
        more.hidden = page >= pages;
      })
      .catch(function () {
        if (p === 1) summary.innerHTML = '<div class="alert alert-danger">' + K.icon("alert", "icon-sm") + ' نظرات بارگذاری نشد. <button type="button" class="link" data-retry-reviews>تلاش دوباره</button></div>';
        else K.toast("بارگذاری نظرات انجام نشد", "error");
      })
      .finally(function () { more.classList.remove("is-loading"); });
  }
  if (rv) {
    // Load reviews when the section approaches the viewport.
    var started = false;
    var start = function () { if (!started) { started = true; load(1); } };
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en, ob) { if (en[0].isIntersecting) { start(); ob.disconnect(); } }, { rootMargin: "400px" }).observe(rv);
    } else start();
    if (location.hash === "#reviews") start();
    more.addEventListener("click", function () { load(page + 1); });
    rv.addEventListener("click", function (e) {
      if (e.target.closest("[data-retry-reviews]")) load(1);
      if (e.target.closest("[data-write-review]")) {
        if (!K.user) { K.toast("برای ثبت نظر ابتدا وارد شوید", "info"); K.openAuth(location.pathname + "#reviews"); return; }
        var f = $("[data-review-form]");
        if (mine) {
          f.text.value = mine.text;
          var r = f.querySelector('input[name="rating"][value="' + mine.rating + '"]');
          if (r) r.checked = true;
        }
        K.open("review-sheet", { focus: "input[name=rating]" });
      }
      if (e.target.closest("[data-delete-review]")) {
        if (!confirm("نظر شما حذف شود؟")) return;
        K.api("/api/products/" + productId + "/reviews/mine", { method: "DELETE" })
          .then(function (d) { K.toast(d.message, "success"); mine = null; load(1); })
          .catch(function (e2) { K.toast(e2.message, "error"); });
      }
    });

    var rf = $("[data-review-form]");
    rf.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = $('[type="submit"]', rf), fd = new FormData(rf);
      var rating = +fd.get("rating") || 0, text = String(fd.get("text") || "").trim();
      var bad = false;
      var ferr = function (n, m) { var p = $('[data-error-for="' + n + '"]', rf); p.hidden = !m; p.textContent = m || ""; };
      ferr("rating", rating ? "" : "امتیاز را انتخاب کنید");
      ferr("text", text.length >= 5 ? "" : "نظرتان را کمی کامل‌تر بنویسید (حداقل ۵ حرف)");
      bad = !rating || text.length < 5;
      if (bad) return;
      K.setLoading(btn, true);
      K.api("/api/products/" + productId + "/reviews", { method: "POST", body: { rating: rating, text: text, authorName: fd.get("authorName") } })
        .then(function (d) { K.close(); K.toast(d.message, "success"); rf.reset(); load(1); })
        .catch(function (e2) { ferr(e2.data && e2.data.field === "rating" ? "rating" : "text", e2.message); })
        .finally(function () { K.setLoading(btn, false); });
    });
  }
})();
