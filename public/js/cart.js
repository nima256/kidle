/* Cart page — renders from the server-computed cart and re-renders after every change. */
(function () {
  "use strict";
  var K = window.KIDLE, $ = K.$;
  var root = $("#cart-root");
  if (!root) return;
  var cart = JSON.parse($("#cart-data").textContent);
  var loggedIn = !!root.getAttribute("data-logged-in");
  var busy = false;

  var T = function (n) { return K.price(n) + ' <span class="currency">تومان</span>'; };

  function itemHTML(it) {
    var opts = [];
    if (it.selectedSize) opts.push('<span class="badge badge-neutral">سایز ' + K.esc(it.selectedSize) + "</span>");
    if (it.selectedColor) opts.push('<span class="badge badge-neutral"><span class="size-2.5 rounded-full border border-ink-300" style="background:' + K.esc(it.colorHex || "#eee") + '"></span>' + K.esc(it.selectedColor) + "</span>");
    var max = Math.min(20, Math.max(it.available, 1));
    return '<li class="flex gap-3 py-3.5" data-key="' + K.esc(it.key) + '">' +
      '<a href="/productDetails/' + encodeURIComponent(it.slug) + '" tabindex="-1" aria-hidden="true" class="w-20 shrink-0 overflow-hidden rounded-md bg-ink-100 sm:w-24">' +
      (it.image ? '<img src="' + K.esc(it.image) + '" alt="" class="aspect-[4/5] w-full object-cover" loading="lazy">' : '<span class="block aspect-[4/5]"></span>') + "</a>" +
      '<div class="flex min-w-0 flex-1 flex-col gap-1.5">' +
      '<div class="flex items-start justify-between gap-2"><a href="/productDetails/' + encodeURIComponent(it.slug) + '" class="line-clamp-2 text-sm font-semibold leading-6 hover:text-brand-700">' + K.esc(it.name) + "</a>" +
      '<button type="button" class="btn-icon -mt-1.5 -me-2 size-9 shrink-0 text-ink-400 hover:text-danger-600" data-remove aria-label="حذف ' + K.esc(it.name) + ' از سبد">' + K.icon("trash", "icon-sm") + "</button></div>" +
      (opts.length ? '<div class="flex flex-wrap gap-1">' + opts.join("") + "</div>" : "") +
      (it.stockProblem ? '<p class="field-error">' + K.icon("alert", "icon-sm") + (it.outOfStock ? " این کالا ناموجود شده؛ لطفاً حذفش کنید" : " فقط " + K.fa(it.available) + " عدد موجود است") + "</p>" : "") +
      '<div class="mt-auto flex items-end justify-between gap-2">' +
      '<div class="qty"><button type="button" data-step="1" aria-label="افزایش تعداد" ' + (it.quantity >= max ? "disabled" : "") + ">" + K.icon("plus", "icon-sm") + '</button><output aria-live="polite">' + K.fa(it.quantity) + "</output>" +
      (it.quantity <= 1 ? '<button type="button" data-remove aria-label="حذف">' + K.icon("trash", "icon-sm") + "</button>" : '<button type="button" data-step="-1" aria-label="کاهش تعداد">' + K.icon("minus", "icon-sm") + "</button>") + "</div>" +
      '<div class="text-end">' + (it.unitPrice < it.price ? '<span class="price-old block">' + K.price(it.price * it.quantity) + "</span>" : "") +
      '<span class="price text-sm">' + T(it.lineTotal) + "</span>" + (it.quantity > 1 ? '<span class="block text-2xs text-ink-500">هر عدد ' + K.price(it.unitPrice) + "</span>" : "") + "</div></div></div></li>";
  }

  function summaryHTML(c) {
    var rows = '<div class="flex justify-between"><dt class="text-ink-600">جمع کالاها (' + K.fa(c.count) + ")</dt><dd>" + T(c.subtotal + c.productSavings) + "</dd></div>";
    if (c.productSavings) rows += '<div class="flex justify-between text-mint-700"><dt>تخفیف محصولات</dt><dd>−' + T(c.productSavings) + "</dd></div>";
    if (c.discount) rows += '<div class="flex justify-between text-mint-700"><dt>کد تخفیف <span class="ltr font-bold">' + K.esc(c.discount.code) + '</span> <button type="button" class="link text-xs text-danger-600" data-remove-discount>حذف</button></dt><dd>−' + T(c.discountAmount) + "</dd></div>";
    rows += '<div class="flex justify-between"><dt class="text-ink-600">هزینه ارسال</dt><dd class="font-medium text-ink-700">پس‌کرایه</dd></div>';
    return '<div class="card card-pad lg:sticky lg:top-[calc(var(--header-h)+1rem)]">' +
      '<h2 class="mb-3 text-base font-bold">خلاصه سفارش</h2>' +
      '<dl class="space-y-2.5 text-sm">' + rows + "</dl>" +
      '<div class="my-3 border-t border-dashed border-ink-200"></div>' +
      '<div class="flex items-center justify-between"><span class="text-sm font-bold">مبلغ قابل پرداخت</span><span class="price text-lg">' + T(c.payable) + "</span></div>" +
      ((c.productSavings + c.discountAmount) > 0 ? '<p class="mt-1 text-end text-xs font-medium text-mint-700">سود شما: ' + K.price(c.productSavings + c.discountAmount) + " تومان</p>" : "") +
      '<p class="mt-3 flex items-start gap-1.5 rounded-md bg-butter-100 p-2.5 text-xs leading-6 text-butter-700">' + K.icon("truck", "icon-sm mt-1 shrink-0") + "هزینه ارسال در این مبلغ نیست و هنگام تحویل مرسوله (پس‌کرایه) پرداخت می‌شود.</p>" +
      (c.discount ? "" : '<details class="mt-3 group" ' + (c.discountError ? "open" : "") + '><summary class="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-brand-700 [&::-webkit-details-marker]:hidden">' + K.icon("tag", "icon-sm") + ' کد تخفیف دارید؟</summary>' +
        '<form class="mt-2 flex gap-2" data-discount-form novalidate><label class="sr-only" for="dc">کد تخفیف</label><input id="dc" name="code" class="input ltr !min-h-10 uppercase" autocomplete="off" placeholder="مثلاً KIDLE10" aria-describedby="dc-err"><button class="btn btn-dark !h-10"><span class="spinner"></span><span class="btn-label-idle">اعمال</span></button></form>' +
        '<p class="field-error mt-1" id="dc-err" ' + (c.discountError ? "" : "hidden") + ">" + K.esc(c.discountError || "") + "</p></details>") +
      '<button type="button" class="btn btn-primary btn-lg btn-block mt-4 hidden lg:inline-flex" data-checkout ' + (c.canCheckout ? "" : "disabled") + ">ادامه و ثبت آدرس " + K.icon("arrow-left", "icon-sm") + "</button>" +
      "</div>";
  }

  function render() {
    var titleCount = $("[data-cart-title-count]");
    if (titleCount) titleCount.textContent = cart.count ? "(" + K.fa(cart.count) + " کالا)" : "";
    K.setCartCount(cart.count);
    if (!cart.items.length) {
      root.innerHTML = '<div class="empty-state card"><span class="empty-art">' + K.icon("bag", "size-9") + '</span><h2 class="text-lg font-bold">سبد خرید شما خالی است</h2><p class="max-w-xs text-sm leading-7 text-ink-600">لباس‌های تازه و تخفیف‌دار منتظر شما هستند.</p><div class="flex gap-2"><a class="btn btn-primary" href="/shop">شروع خرید</a><a class="btn btn-secondary" href="/shop?sale=1">دیدن تخفیف‌ها</a></div></div>';
      var bar = $("[data-cart-bar]");
      if (bar) bar.remove();
      return;
    }
    var issues = cart.issues.length ? '<div class="alert alert-warn mb-3" role="alert">' + K.icon("alert", "icon-sm mt-0.5 shrink-0") + '<div><b>برای ادامه، این موارد را اصلاح کنید:</b><ul class="mt-1 list-disc ps-4">' + cart.issues.map(function (i) { return "<li>" + K.esc(i) + "</li>"; }).join("") + "</ul></div></div>" : "";
    root.innerHTML = issues + '<div class="grid gap-4 lg:grid-cols-[1fr_22rem] lg:gap-6 lg:items-start">' +
      '<ul class="card divide-y divide-ink-100 px-3.5 sm:px-5" aria-label="کالاهای سبد">' + cart.items.map(itemHTML).join("") + "</ul>" +
      "<div>" + summaryHTML(cart) + "</div></div>";
    renderBar();
  }

  function renderBar() {
    var bar = $("[data-cart-bar]");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "action-bar lg:hidden";
      bar.setAttribute("data-cart-bar", "");
      document.body.appendChild(bar);
    }
    bar.innerHTML = '<div class="flex items-center gap-3"><div><span class="block text-2xs text-ink-500">مبلغ قابل پرداخت</span><span class="price text-lg leading-6">' + T(cart.payable) + '</span></div><button type="button" class="btn btn-primary btn-lg flex-1" data-checkout ' + (cart.canCheckout ? "" : "disabled") + ">ادامه خرید " + K.icon("arrow-left", "icon-sm") + "</button></div>";
  }

  function mutate(method, body) {
    if (busy) return Promise.resolve();
    busy = true;
    root.setAttribute("aria-busy", "true");
    root.style.opacity = ".6";
    return K.api("/api/cart/items", { method: method, body: body })
      .then(function (d) { cart = d.cart; render(); })
      .catch(function (e) { K.toast(e.message, "error"); return K.api("/api/cart").then(function (d) { cart = d.cart; render(); }); })
      .finally(function () { busy = false; root.style.opacity = ""; root.removeAttribute("aria-busy"); });
  }

  document.addEventListener("click", function (e) {
    var li = e.target.closest("[data-key]");
    var step = e.target.closest("[data-step]");
    if (li && step && root.contains(li)) {
      var it = cart.items.find(function (x) { return x.key === li.getAttribute("data-key"); });
      mutate("PATCH", { key: it.key, quantity: it.quantity + +step.getAttribute("data-step") });
      return;
    }
    if (li && e.target.closest("[data-remove]")) {
      var key = li.getAttribute("data-key");
      var removed = cart.items.find(function (x) { return x.key === key; }) || {};
      mutate("DELETE", { key: key }).then(function () {
        K.toast("«" + removed.name + "» از سبد حذف شد", "info", {
          duration: 6000,
          action: {
            label: "بازگرداندن",
            onClick: function () {
              K.api("/api/cart/items", { method: "POST", body: { productId: removed.productId, quantity: removed.quantity, color: removed.selectedColor, size: removed.selectedSize } })
                .then(function () { return K.api("/api/cart"); })
                .then(function (d) { cart = d.cart; render(); K.toast("به سبد برگشت", "success"); })
                .catch(function (err) { K.toast(err.message, "error"); });
            },
          },
        });
      });
      return;
    }
    if (e.target.closest("[data-remove-discount]")) {
      K.api("/api/cart/discount", { method: "DELETE" }).then(function (d) { cart = d.cart; render(); K.toast(d.message, "info"); });
      return;
    }
    if (e.target.closest("[data-checkout]")) {
      if (!cart.canCheckout) return;
      if (loggedIn) location.href = "/checkout";
      else { K.toast("برای ثبت سفارش، با شماره موبایل وارد شوید", "info"); K.openAuth("/checkout"); }
    }
  });

  document.addEventListener("submit", function (e) {
    var f = e.target.closest("[data-discount-form]");
    if (!f) return;
    e.preventDefault();
    var btn = $("button", f), code = f.code.value.trim(), errEl = $("#dc-err");
    if (!code) { errEl.hidden = false; errEl.textContent = "کد تخفیف را وارد کنید"; return; }
    K.setLoading(btn, true);
    K.api("/api/cart/discount", { method: "POST", body: { code: code } })
      .then(function (d) { cart = d.cart; render(); K.toast(d.message, "success"); })
      .catch(function (err) { errEl.hidden = false; errEl.textContent = err.message; f.code.setAttribute("aria-invalid", "true"); })
      .finally(function () { K.setLoading(btn, false); });
  });

  render();
})();
