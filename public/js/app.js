/* Kidle — global storefront runtime. Loaded (deferred) on every page. */
(function () {
  "use strict";

  var K = (window.KIDLE = window.KIDLE || {});
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  K.$ = $;
  K.$$ = $$;

  var FA = "۰۱۲۳۴۵۶۷۸۹";
  K.toEn = function (s) {
    return String(s == null ? "" : s)
      .replace(/[۰-۹]/g, function (d) { return FA.indexOf(d); })
      .replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); });
  };
  K.fa = function (s) { return String(s).replace(/\d/g, function (d) { return FA[d]; }); };
  K.price = function (n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, "٬"); };
  K.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  K.icon = function (name, cls) {
    return '<svg class="icon ' + (cls || "") + '" aria-hidden="true"><use href="/icons.svg#' + name + '"/></svg>';
  };

  /* ───────── Toasts ───────── */
  K.toast = function (message, type, opts) {
    opts = opts || {};
    var region = $("#toasts");
    if (!region || !message) return;
    var el = document.createElement("div");
    el.className = "toast toast-" + (type || "info");
    el.setAttribute("role", type === "error" ? "alert" : "status");
    var ic = type === "error" ? "x-circle" : type === "success" ? "check-circle" : "info";
    el.innerHTML = '<span class="toast-icon">' + K.icon(ic) + "</span><span>" + K.esc(message) + "</span>";
    if (opts.action) {
      var a = document.createElement("a");
      a.className = "toast-action";
      a.href = opts.action.href;
      a.textContent = opts.action.label;
      el.appendChild(a);
    }
    region.appendChild(el);
    while (region.children.length > 3) region.removeChild(region.firstChild);
    setTimeout(function () {
      el.classList.add("is-leaving");
      setTimeout(function () { el.remove(); }, 220);
    }, opts.duration || (type === "error" ? 5000 : 3200));
  };

  /* ───────── API ───────── */
  K.api = function (url, options) {
    options = options || {};
    var init = { method: options.method || "GET", headers: { Accept: "application/json" }, credentials: "same-origin" };
    if (options.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    return fetch(url, init)
      .catch(function () {
        var e = new Error("اتصال اینترنت برقرار نیست. دوباره تلاش کنید");
        e.network = true;
        throw e;
      })
      .then(function (res) {
        return res
          .json()
          .catch(function () { return {}; })
          .then(function (data) {
            if (res.ok && data.success !== false) return data;
            var err = new Error(data.message || "مشکلی پیش آمد. دوباره تلاش کنید");
            err.status = res.status;
            err.data = data;
            if (res.status === 401 && data.code === "AUTH_REQUIRED") K.openAuth();
            throw err;
          });
      });
  };

  K.setLoading = function (btn, on) {
    if (!btn) return;
    btn.classList.toggle("is-loading", !!on);
    btn.disabled = !!on;
    btn.setAttribute("aria-busy", on ? "true" : "false");
  };

  K.setCartCount = function (n) {
    K.cartCount = n;
    $$("[data-cart-count]").forEach(function (el) {
      el.textContent = K.fa(n);
      el.hidden = !n;
      el.classList.remove("animate-pop");
      void el.offsetWidth;
      el.classList.add("animate-pop");
    });
    $$("[data-cart-link]").forEach(function (a) { a.setAttribute("aria-label", "سبد خرید، " + n + " کالا"); });
  };

  /* ───────── Overlays (modals / sheets / drawer) ───────── */
  var stack = [];
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select,textarea,[tabindex]:not([tabindex="-1"])';

  function lockScroll() { document.body.classList.toggle("scroll-locked", stack.length > 0); }

  function openLayer(el, backdrop, opts) {
    if (!el || stack.some(function (l) { return l.el === el; })) return;
    var layer = { el: el, backdrop: backdrop, returnFocus: document.activeElement, onClose: opts && opts.onClose };
    stack.push(layer);
    var persistent = el.hasAttribute("data-persistent");
    layer.persistent = persistent;
    if (backdrop) backdrop.hidden = false;
    if (!persistent) el.hidden = false;
    requestAnimationFrame(function () {
      el.classList.add("is-open");
      if (backdrop) backdrop.classList.add("is-open");
      var target = (opts && opts.focus && $(opts.focus, el)) || $(FOCUSABLE, el);
      if (target) target.focus({ preventScroll: true });
    });
    lockScroll();
    // Let the Android/iOS back gesture close the layer instead of leaving the page.
    try { history.pushState({ kidleLayer: stack.length }, ""); } catch (e) {}
  }

  function closeTop(fromHistory) {
    var layer = stack.pop();
    if (!layer) return;
    layer.el.classList.remove("is-open");
    if (layer.backdrop) layer.backdrop.classList.remove("is-open");
    setTimeout(function () {
      if (!layer.persistent) layer.el.hidden = true;
      if (layer.backdrop) layer.backdrop.hidden = true;
    }, 260);
    lockScroll();
    if (layer.returnFocus && layer.returnFocus.focus) layer.returnFocus.focus({ preventScroll: true });
    if (layer.onClose) layer.onClose();
    if (!fromHistory && history.state && history.state.kidleLayer) {
      K._ignorePop = true;
      history.back();
    }
  }

  K.open = function (id, opts) { openLayer(document.getElementById(id), null, opts); };
  K.isOpen = function (el) { return stack.some(function (l) { return l.el === el; }); };
  K.close = function () { closeTop(false); };
  K.closeAll = function () { while (stack.length) closeTop(false); };

  window.addEventListener("popstate", function () {
    if (K._ignorePop) { K._ignorePop = false; return; }
    if (stack.length) closeTop(true);
  });

  document.addEventListener("keydown", function (e) {
    if (!stack.length) return;
    var top = stack[stack.length - 1].el;
    if (e.key === "Escape") { e.preventDefault(); closeTop(false); return; }
    if (e.key === "Tab") {
      var items = $$(FOCUSABLE, top).filter(function (x) { return x.offsetParent !== null; });
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.closest("[data-close-overlay]") || t.closest("[data-close-drawer]")) { e.preventDefault(); closeTop(false); return; }
    if (t.matches("[data-overlay]") || t.matches("[data-drawer-overlay]")) { closeTop(false); return; }
    var od = t.closest("[data-open-drawer]");
    if (od) {
      e.preventDefault();
      if (stack.length) K.closeAll();
      openLayer($("#menu-drawer"), $("[data-drawer-overlay]"));
      $$("[data-open-drawer]").forEach(function (b) { b.setAttribute("aria-expanded", "true"); });
      return;
    }
    if (t.closest("[data-open-search]")) {
      e.preventDefault();
      if (stack.length) K.closeAll();
      openLayer($("#search-overlay"), null, { focus: "input" });
      return;
    }
    if (t.closest("[data-open-auth]")) { e.preventDefault(); K.openAuth(); }
  });

  /* ───────── Desktop dropdown ───────── */
  $$("[data-dropdown]").forEach(function (dd) {
    var btn = $("[data-dropdown-trigger]", dd), panel = $("[data-dropdown-panel]", dd), timer;
    var set = function (open) {
      panel.classList.toggle("hidden", !open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    };
    btn.addEventListener("click", function () { set(panel.classList.contains("hidden")); });
    dd.addEventListener("mouseenter", function () { clearTimeout(timer); set(true); });
    dd.addEventListener("mouseleave", function () { timer = setTimeout(function () { set(false); }, 150); });
    dd.addEventListener("keydown", function (e) { if (e.key === "Escape") { set(false); btn.focus(); } });
    document.addEventListener("click", function (e) { if (!dd.contains(e.target)) set(false); });
  });

  /* ───────── Search suggestions ───────── */
  $$("[data-search-form]").forEach(function (form) {
    var input = $("[data-search-input]", form);
    var box = $("[data-search-results]", form) || $("[data-search-results]", form.parentElement);
    if (!input || !box) return;
    var empty = $("[data-search-empty]", box);
    var emptyHTML = empty ? empty.outerHTML : "";
    var seq = 0, timer, isDropdown = box.parentElement === form;

    function show(html) {
      box.innerHTML = html;
      if (isDropdown) box.classList.toggle("hidden", !html);
    }
    function render(q, data) {
      if (!data.products.length && !data.categories.length) {
        return show('<div class="p-4 text-sm text-ink-600">نتیجه‌ای برای «' + K.esc(q) + '» پیدا نشد. املای دیگری را امتحان کنید یا <a class="link" href="/shop">همه محصولات</a> را ببینید.</div>');
      }
      var h = "";
      if (data.categories.length) {
        h += '<div class="flex flex-wrap gap-2 border-b border-ink-100 p-3">';
        data.categories.forEach(function (c) { h += '<a class="chip" href="/category/' + encodeURIComponent(c.slug) + '">' + K.icon("grid", "icon-sm text-brand-500") + K.esc(c.name) + "</a>"; });
        h += "</div>";
      }
      data.products.forEach(function (p) {
        h += '<a role="option" class="flex items-center gap-3 px-3 py-2 hover:bg-brand-50 focus:bg-brand-50 focus:outline-none" href="' + K.esc(p.url) + '">' +
          (p.image ? '<img src="' + K.esc(p.image) + '" alt="" width="44" height="55" class="h-[3.4rem] w-11 shrink-0 rounded-md bg-ink-100 object-cover" loading="lazy">' : '<span class="h-[3.4rem] w-11 shrink-0 rounded-md bg-ink-100"></span>') +
          '<span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium">' + K.esc(p.name) + '</span><span class="text-xs ' + (p.inStock ? "text-ink-600" : "text-ink-400") + '">' + (p.inStock ? K.price(p.price) + " تومان" : "ناموجود") + "</span></span></a>";
      });
      h += '<a class="flex items-center justify-center gap-1 border-t border-ink-100 p-3 text-sm font-semibold text-brand-700 hover:bg-brand-50" href="/search?q=' + encodeURIComponent(q) + '">دیدن همه نتایج ' + K.icon("arrow-left", "icon-sm") + "</a>";
      show(h);
    }

    input.addEventListener("input", function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 2) { show(isDropdown ? "" : emptyHTML); return; }
      timer = setTimeout(function () {
        var my = ++seq;
        if (!isDropdown || !box.innerHTML) show('<div class="space-y-2 p-3"><div class="skeleton h-12"></div><div class="skeleton h-12"></div></div>');
        K.api("/api/search/suggest?q=" + encodeURIComponent(q))
          .then(function (d) { if (my === seq) render(q, d); })
          .catch(function () { if (my === seq) show('<div class="p-4 text-sm text-danger-700">جستجو انجام نشد. اتصال را بررسی کنید.</div>'); });
      }, 220);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowDown") return;
      var first = $("a", box);
      if (first) { e.preventDefault(); first.focus(); }
    });
    box.addEventListener("keydown", function (e) {
      var links = $$("a", box), i = links.indexOf(document.activeElement);
      if (e.key === "ArrowDown" && i < links.length - 1) { e.preventDefault(); links[i + 1].focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); (i > 0 ? links[i - 1] : input).focus(); }
    });
    form.addEventListener("submit", function (e) { if (!input.value.trim()) e.preventDefault(); });
    if (isDropdown) {
      document.addEventListener("click", function (e) { if (!form.contains(e.target)) box.classList.add("hidden"); });
      input.addEventListener("focus", function () { if (box.innerHTML) box.classList.remove("hidden"); });
    }
  });

  /* ───────── Numeric inputs accept Persian digits ───────── */
  document.addEventListener("input", function (e) {
    var el = e.target;
    if (el.matches && el.matches('[inputmode="numeric"], [data-digits]')) {
      var v = K.toEn(el.value);
      if (v !== el.value) el.value = v;
    }
  });

  /* ───────── Passwordless login (phone → OTP) ───────── */
  var auth = { mobile: "", timer: null, next: null };

  K.openAuth = function (next) {
    var ov = $("#auth-overlay");
    if (!ov) return;
    if (next) auth.next = next;
    if (stack.length) K.closeAll();
    showStep(auth.mobile && !$('[data-auth-step="code"]').hidden ? "code" : "phone");
    openLayer(ov, null, { focus: auth.mobile && !$('[data-auth-step="code"]').hidden ? "#auth-code" : "#auth-mobile" });
  };

  function showStep(step) {
    $$("[data-auth-step]").forEach(function (f) { f.hidden = f.getAttribute("data-auth-step") !== step; });
    $$("[data-auth-back]").forEach(function (b) {
      if (b.classList.contains("btn-icon")) b.classList.toggle("invisible", step === "phone");
    });
  }

  function fieldError(id, msg) {
    var p = document.getElementById(id + "-error"), input = document.getElementById(id);
    if (!p) return;
    p.hidden = !msg;
    p.innerHTML = msg ? K.icon("alert", "icon-sm") + " " + K.esc(msg) : "";
    if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
  }

  function startCountdown(seconds) {
    clearInterval(auth.timer);
    var left = seconds, t = $("[data-auth-timer]"), s = $("[data-auth-seconds]"), r = $("[data-auth-resend]");
    t.hidden = false; r.hidden = true;
    s.textContent = K.fa(left);
    auth.timer = setInterval(function () {
      left -= 1;
      s.textContent = K.fa(Math.max(0, left));
      if (left <= 0) { clearInterval(auth.timer); t.hidden = true; r.hidden = false; }
    }, 1000);
  }

  function requestCode(btn) {
    K.setLoading(btn, true);
    return K.api("/api/auth/otp/request", { method: "POST", body: { mobile: auth.mobile } })
      .then(function (d) {
        auth.mobile = d.mobile;
        $("[data-auth-mobile]").textContent = K.fa(d.mobile);
        showStep("code");
        var code = $("#auth-code");
        code.value = "";
        fieldError("auth-code", "");
        code.focus();
        startCountdown(d.retryAfter || 60);
        K.toast("کد تأیید پیامک شد", "success");
        listenForWebOtp();
      })
      .catch(function (err) {
        if (err.data && err.data.code === "COOLDOWN") {
          // A code is already on its way — go to the code step with the remaining time.
          $("[data-auth-mobile]").textContent = K.fa(auth.mobile);
          showStep("code");
          startCountdown(err.data.retryAfter || 60);
          $("#auth-code").focus();
          return;
        }
        var target = $('[data-auth-step="code"]').hidden ? "auth-mobile" : "auth-code";
        fieldError(target, err.message);
      })
      .finally(function () { K.setLoading(btn, false); });
  }

  function listenForWebOtp() {
    if (!("OTPCredential" in window)) return;
    try {
      var ac = new AbortController();
      setTimeout(function () { ac.abort(); }, 120000);
      navigator.credentials.get({ otp: { transport: ["sms"] }, signal: ac.signal }).then(function (otp) {
        if (otp && otp.code) { var c = $("#auth-code"); c.value = otp.code; $('[data-auth-step="code"]').requestSubmit(); }
      }).catch(function () {});
    } catch (e) {}
  }

  var phoneForm = $('[data-auth-step="phone"]');
  if (phoneForm) {
    phoneForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var raw = K.toEn($("#auth-mobile").value).replace(/[\s\-]/g, "").replace(/^\+98|^0098/, "0");
      if (/^9\d{9}$/.test(raw)) raw = "0" + raw;
      if (!/^09\d{9}$/.test(raw)) { fieldError("auth-mobile", "شماره موبایل ۱۱ رقمی و با ۰۹ شروع می‌شود"); $("#auth-mobile").focus(); return; }
      fieldError("auth-mobile", "");
      auth.mobile = raw;
      requestCode(phoneForm.querySelector('[type="submit"]'));
    });

    var codeForm = $('[data-auth-step="code"]');
    var codeInput = $("#auth-code");
    codeInput.addEventListener("input", function () {
      codeInput.value = K.toEn(codeInput.value).replace(/\D/g, "").slice(0, 5);
      if (codeInput.value.length === 5) codeForm.requestSubmit();
    });
    codeForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = codeForm.querySelector('[type="submit"]');
      if (btn.disabled) return;
      if (codeInput.value.length !== 5) { fieldError("auth-code", "کد ۵ رقمی را کامل وارد کنید"); return; }
      K.setLoading(btn, true);
      K.api("/api/auth/otp/verify", { method: "POST", body: { mobile: auth.mobile, code: codeInput.value } })
        .then(function (d) {
          clearInterval(auth.timer);
          btn.querySelector(".btn-label-idle").textContent = "وارد شدید";
          K.toast(d.message, "success");
          var next = auth.next || new URLSearchParams(location.search).get("next");
          setTimeout(function () {
            if (next && next.charAt(0) === "/" && next.charAt(1) !== "/") location.href = next;
            else {
              var u = new URL(location.href);
              u.searchParams.delete("login");
              u.searchParams.delete("next");
              location.replace(u.pathname + u.search + u.hash);
            }
          }, 350);
        })
        .catch(function (err) {
          K.setLoading(btn, false);
          fieldError("auth-code", err.message);
          codeInput.select();
          var c = err.data && err.data.code;
          if (c === "EXPIRED" || c === "LOCKED") {
            clearInterval(auth.timer);
            $("[data-auth-timer]").hidden = true;
            $("[data-auth-resend]").hidden = false;
          }
        });
    });

    $("[data-auth-resend]").addEventListener("click", function () { requestCode(this); });
    $$("[data-auth-back]").forEach(function (b) {
      b.addEventListener("click", function () {
        clearInterval(auth.timer);
        showStep("phone");
        $("#auth-mobile").value = auth.mobile;
        $("#auth-mobile").focus();
      });
    });
  }

  /* ───────── Logout ───────── */
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-logout]");
    if (!b) return;
    e.preventDefault();
    K.setLoading(b, true);
    K.api("/api/auth/logout", { method: "POST" })
      .then(function () { location.href = "/"; })
      .catch(function (err) { K.setLoading(b, false); K.toast(err.message, "error"); });
  });

  /* ───────── Boot ───────── */
  var params = new URLSearchParams(location.search);
  if (params.get("login") === "1" && !K.user) {
    // Wait a tick so history state for the overlay is pushed after load.
    setTimeout(function () { K.openAuth(); }, 50);
  }
  var flash = params.get("msg");
  if (flash) K.toast(flash, "info");
})();
