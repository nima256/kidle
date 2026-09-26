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
    if (it.selectedSize) opts.push('<span class="inline-flex items-center gap-1 rounded-sm bg-linen-100 px-2 py-0.5 text-xs font-semibold text-ink-800">سایز ' + K.esc(it.selectedSize) + "</span>");
    if (it.selectedColor) opts.push('<span class="inline-flex items-center gap-1.5 rounded-sm bg-linen-100 px-2 py-0.5 text-xs font-semibold text-ink-800"><span class="size-2.5 rounded-full ring-1 ring-ink-950/15" style="background:' + K.esc(it.colorHex || "#eee") + '"></span>' + K.esc(it.selectedColor) + "</span>");
    var max = Math.min(20, Math.max(it.available, 1));
    var url = "/productDetails/" + encodeURIComponent(it.slug);
    return '<li class="flex gap-3.5 py-5 first:pt-0 sm:gap-5" data-key="' + K.esc(it.key) + '">' +
      '<a href="' + url + '" tabindex="-1" aria-hidden="true" class="w-24 shrink-0 overflow-hidden rounded-md bg-linen-100 sm:w-28">' +
      (it.image ? '<img src="' + K.esc(it.image) + '" alt="" class="aspect-[4/5] w-full object-cover" loading="lazy">' : '<span class="block aspect-[4/5]"></span>') + "</a>" +
      '<div class="flex min-w-0 flex-1 flex-col gap-2">' +
      '<div class="flex items-start justify-between gap-2"><a href="' + url + '" class="line-clamp-2 text-[0.9375rem] font-semibold leading-7 text-ink-950 hover:text-brand-700">' + K.esc(it.name) + "</a>" +
      '<button type="button" class="icon-btn -mt-2 -me-2.5 shrink-0 text-ink-500 hover:!text-danger-600" data-remove aria-label="حذف ' + K.esc(it.name) + ' از سبد">' + K.icon("trash", "icon-sm") + "</button></div>" +
      (opts.length ? '<div class="flex flex-wrap gap-1.5">' + opts.join("") + "</div>" : "") +
      (it.stockProblem ? '<p class="field-error">' + K.icon("alert", "icon-sm") + (it.outOfStock ? " این کالا ناموجود شده؛ لطفاً حذفش کنید" : " فقط " + K.fa(it.available) + " عدد موجود است") + "</p>" : "") +
      '<div class="mt-auto flex flex-wrap items-end justify-between gap-2 pt-1">' +
      '<div class="qty qty-sm"><button type="button" data-step="1" aria-label="افزایش تعداد ' + K.esc(it.name) + '" ' + (it.quantity >= max ? "disabled" : "") + ">" + K.icon("plus", "icon-sm") + '</button><output aria-live="polite">' + K.fa(it.quantity) + "</output>" +
      (it.quantity <= 1 ? '<button type="button" data-remove aria-label="حذف ' + K.esc(it.name) + '">' + K.icon("trash", "icon-sm") + "</button>" : '<button type="button" data-step="-1" aria-label="کاهش تعداد ' + K.esc(it.name) + '">' + K.icon("minus", "icon-sm") + "</button>") + "</div>" +
      '<div class="text-end leading-tight">' + (it.unitPrice < it.price ? '<span class="price-old block">' + K.price(it.price * it.quantity) + "</span>" : "") +
      '<span class="price ' + (it.unitPrice < it.price ? "price-sale" : "") + '">' + T(it.lineTotal) + "</span>" + (it.quantity > 1 ? '<span class="mt-0.5 block text-xs text-ink-500">هر عدد ' + K.price(it.unitPrice) + "</span>" : "") + "</div></div></div></li>";
  }

  function summaryHTML(c) {
    var rows = '<div class="flex justify-between"><dt class="text-ink-600">قیمت کالاها (' + K.fa(c.count) + ")</dt><dd>" + T(c.subtotal + c.productSavings) + "</dd></div>";
    if (c.productSavings) rows += '<div class="flex justify-between text-brand-700"><dt>تخفیف محصولات</dt><dd>−' + T(c.productSavings) + "</dd></div>";
    if (c.discount) rows += '<div class="flex items-center justify-between text-brand-700"><dt class="flex items-center gap-1.5">کد <span class="ltr rounded-sm bg-brand-50 px-1.5 font-bold">' + K.esc(c.discount.code) + '</span> <button type="button" class="link !text-xs !text-ink-600" data-remove-discount>حذف</button></dt><dd>−' + T(c.discountAmount) + "</dd></div>";
    rows += '<div class="flex justify-between"><dt class="text-ink-600">هزینه ارسال</dt><dd class="font-medium text-ink-800">پس‌کرایه، هنگام تحویل</dd></div>';
    var saved = c.productSavings + c.discountAmount;
    return '<div class="lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]"><div class="panel p-5 sm:p-6">' +
      '<h2 class="font-display text-xl font-bold">خلاصه سفارش</h2>' +
      '<dl class="mt-4 space-y-3 text-sm">' + rows + "</dl>" +
      '<div class="rule-dashed my-4"></div>' +
      '<div class="flex items-end justify-between"><span class="text-sm font-bold">مبلغ قابل پرداخت</span><span class="price text-2xl leading-none">' + T(c.payable) + "</span></div>" +
      (saved > 0 ? '<p class="mt-2 rounded-sm bg-brand-50 px-2.5 py-1.5 text-center text-xs font-bold text-brand-700">' + K.price(saved) + " تومان در این خرید صرفه‌جویی کردید</p>" : "") +
      (c.discount ? "" : '<details class="mt-4 border-t border-ink-100 pt-3" ' + (c.discountError ? "open" : "") + '><summary class="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ink-900 [&::-webkit-details-marker]:hidden">' + K.icon("tag", "icon-sm text-brand-600") + ' کد تخفیف دارید؟</summary>' +
        '<form class="mt-2 flex gap-2" data-discount-form novalidate><label class="sr-only" for="dc">کد تخفیف</label><input id="dc" name="code" class="input ltr !min-h-11 uppercase" autocomplete="off" placeholder="KIDLE10" aria-describedby="dc-err"><button class="btn btn-dark !h-11 shrink-0"><span class="spinner"></span><span class="btn-label-idle">اعمال</span></button></form>' +
        '<p class="field-error mt-1.5" id="dc-err" ' + (c.discountError ? "" : "hidden") + ">" + K.esc(c.discountError || "") + "</p></details>") +
      '<button type="button" class="btn btn-primary btn-lg btn-block mt-5 hidden lg:inline-flex" data-checkout ' + (c.canCheckout ? "" : "disabled") + ">ادامه و ثبت آدرس " + K.icon("arrow-left", "icon-sm") + "</button>" +
      (loggedIn ? "" : '<p class="mt-3 hidden text-center text-xs leading-6 text-ink-500 lg:block">برای ثبت سفارش فقط به شماره موبایل نیاز دارید.</p>') +
      "</div>" +
      '<ul class="mt-4 space-y-2.5 px-1 text-xs leading-6 text-ink-600">' +
      '<li class="flex items-start gap-2">' + K.icon("truck", "icon-sm mt-1 shrink-0 text-ink-950") + "<span>هزینه ارسال در این مبلغ نیست و هنگام تحویل مرسوله (پس‌کرایه) پرداخت می‌شود.</span></li>" +
      '<li class="flex items-start gap-2">' + K.icon("refresh", "icon-sm mt-1 shrink-0 text-ink-950") + "<span>۷ روز ضمانت بازگشت برای کالای معیوب یا مغایر.</span></li>" +
      '<li class="flex items-start gap-2">' + K.icon("lock", "icon-sm mt-1 shrink-0 text-ink-950") + "<span>پرداخت امن از درگاه رسمی زرین‌پال.</span></li></ul></div>";
  }

  function render() {
    var titleCount = $("[data-cart-title-count]");
    if (titleCount) titleCount.textContent = cart.count ? "(" + K.fa(cart.count) + " کالا)" : "";
    K.setCartCount(cart.count);
    if (!cart.items.length) {
      root.innerHTML = '<div class="state panel-soft"><span class="state-art">' + K.icon("bag", "size-10 !stroke-[1.4]") + '</span><h2 class="state-title">سبد خرید شما خالی است</h2><p class="state-text">لباس‌های تازه و تخفیف‌دار منتظر شما هستند. با یک لمس از روی کارت محصول، سایز را انتخاب و به سبد اضافه کنید.</p><div class="mt-2 flex flex-wrap justify-center gap-2"><a class="btn btn-dark" href="/shop?sort=newest">دیدن تازه‌ها</a><a class="btn btn-outline" href="/shop?sale=1">تخفیف‌ها</a></div></div>';
      var bar = $("[data-cart-bar]");
      if (bar) bar.remove();
      return;
    }
    var issues = cart.issues.length ? '<div class="alert alert-warn mb-4" role="alert">' + K.icon("alert", "icon-sm mt-1 shrink-0") + '<div><b>برای ادامه، این موارد را اصلاح کنید:</b><ul class="mt-1 list-disc ps-4">' + cart.issues.map(function (i) { return "<li>" + K.esc(i) + "</li>"; }).join("") + "</ul></div></div>" : "";
    root.innerHTML = issues + '<div class="grid gap-8 lg:grid-cols-[1fr_24rem] lg:items-start lg:gap-12">' +
      '<ul class="divide-y divide-ink-200 border-b border-ink-200 lg:border-t lg:pt-5" aria-label="کالاهای سبد">' + cart.items.map(itemHTML).join("") + "</ul>" +
      summaryHTML(cart) + "</div>";
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
    bar.innerHTML = '<div class="flex items-center gap-3"><div class="leading-tight"><span class="block text-xs text-ink-500">قابل پرداخت</span><span class="price text-lg">' + T(cart.payable) + '</span></div><button type="button" class="btn btn-primary btn-lg ms-auto flex-1 xs:max-w-60" data-checkout ' + (cart.canCheckout ? "" : "disabled") + ">ادامه خرید " + K.icon("arrow-left", "icon-sm") + "</button></div>";
  }

  function mutate(method, body) {
    if (busy) return Promise.resolve();
    busy = true;
    root.setAttribute("aria-busy", "true");
    root.style.transition = "opacity .15s";
    root.style.opacity = ".55";
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
