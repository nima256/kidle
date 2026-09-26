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

  /* ───────── Recent searches (per browser; storage may be unavailable) ───────── */
  K.recentSearches = function (set) {
    try {
      if (set) { localStorage.setItem("kidle:recent", JSON.stringify(set)); return set; }
      var v = JSON.parse(localStorage.getItem("kidle:recent") || "[]");
      return Array.isArray(v) ? v.filter(function (x) { return typeof x === "string"; }).slice(0, 6) : [];
    } catch (e) { return []; }
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
      var a = document.createElement(opts.action.href ? "a" : "button");
      a.className = "toast-action";
      if (opts.action.href) a.href = opts.action.href;
      else {
        a.type = "button";
        a.addEventListener("click", function () { el.remove(); opts.action.onClick(); });
      }
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
    // Requests that hang get a clear timeout message instead of an endless spinner.
    var ctrl = "AbortController" in window ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, options.timeout || 20000) : null;
    if (ctrl) init.signal = ctrl.signal;
    return fetch(url, init)
      .finally(function () { clearTimeout(timer); })
      .catch(function (err) {
        var timedOut = err && err.name === "AbortError";
        var e = new Error(timedOut ? "پاسخی از سرور دریافت نشد. چند لحظه دیگر دوباره تلاش کنید" : "اتصال اینترنت برقرار نیست. دوباره تلاش کنید");
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
    K.announce(n ? "سبد خرید شما اکنون " + n + " کالا دارد" : "سبد خرید شما خالی است");
  };

  // One polite status region for complete, contextual announcements (no focus change).
  K.announce = function (text) {
    var r = document.getElementById("sr-status");
    if (!r) return;
    r.textContent = "";
    setTimeout(function () { r.textContent = text; }, 60);
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

  // Sheets containing a form marked data-dirty-guard ask before discarding typed input.
  document.addEventListener("input", function (e) {
    var f = e.target.closest && e.target.closest("form[data-dirty-guard]");
    if (f) f.dataset.dirty = "1";
  });
  K.markClean = function (form) { if (form) delete form.dataset.dirty; };

  function closeTop(fromHistory) {
    var top = stack[stack.length - 1];
    if (!top) return;
    var dirty = top.el.querySelector("form[data-dirty-guard][data-dirty]");
    if (dirty && !confirm("متنی که نوشته‌اید ذخیره نشده است. بسته شود؟")) {
      if (fromHistory) { try { history.pushState({ kidleLayer: stack.length }, ""); } catch (e) {} }
      return;
    }
    K.markClean(dirty);
    var layer = stack.pop();
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
    if (empty) {
      var recent = K.recentSearches();
      if (recent.length) {
        emptyHTML = '<div class="border-b border-ink-100 px-5 pt-5 pb-4"><div class="mb-3 flex items-center justify-between"><p class="text-xs font-bold text-ink-500">جستجوهای اخیر</p><button type="button" class="link text-xs" data-clear-recent>پاک کردن</button></div><div class="flex flex-wrap gap-2">' +
          recent.map(function (q) { return '<a class="chip" href="/search?q=' + encodeURIComponent(q) + '">' + K.icon("clock", "icon-sm text-ink-400") + K.esc(q) + "</a>"; }).join("") + "</div></div>" + emptyHTML;
        box.innerHTML = emptyHTML;
      }
      box.addEventListener("click", function (e) {
        if (!e.target.closest("[data-clear-recent]")) return;
        K.recentSearches([]);
        emptyHTML = empty.outerHTML;
        box.innerHTML = emptyHTML;
      });
    }
    var seq = 0, timer, isDropdown = box.parentElement === form;

    function show(html) {
      box.innerHTML = html;
      if (isDropdown) box.classList.toggle("hidden", !html);
    }
    function render(q, data) {
      if (!data.products.length && !data.categories.length) {
        return show('<div class="flex flex-col items-center gap-2 px-5 py-8 text-center"><span class="flex size-12 items-center justify-center rounded-full bg-linen-100 text-ink-700">' + K.icon("search") + '</span><p class="font-bold text-ink-950">نتیجه‌ای برای «' + K.esc(q) + '» پیدا نشد</p><p class="text-sm text-ink-600">املای دیگری را امتحان کنید یا <a class="link" href="/shop">همه محصولات</a> را ببینید.</p></div>');
      }
      var h = "";
      if (data.categories.length) {
        h += '<div class="flex flex-wrap gap-2 border-b border-ink-100 px-4 py-3">';
        data.categories.forEach(function (c) { h += '<a class="chip" href="/category/' + encodeURIComponent(c.slug) + '">' + K.icon("grid", "icon-sm text-ink-400") + K.esc(c.name) + "</a>"; });
        h += "</div>";
      }
      data.products.forEach(function (p) {
        h += '<a class="flex items-center gap-3 px-4 py-2.5 hover:bg-linen-100 focus:bg-linen-100 focus:outline-none" href="' + K.esc(p.url) + '">' +
          (p.image ? '<img src="' + K.esc(p.image) + '" alt="" width="44" height="55" class="h-14 w-11 shrink-0 rounded-sm bg-linen-100 object-cover" loading="lazy">' : '<span class="h-14 w-11 shrink-0 rounded-sm bg-linen-100"></span>') +
          '<span class="min-w-0 flex-1"><span class="block truncate text-sm font-semibold text-ink-950">' + K.esc(p.name) + '</span><span class="text-xs ' + (p.inStock ? "font-bold text-ink-700" : "text-ink-500") + '">' + (p.inStock ? K.price(p.price) + " تومان" : "ناموجود") + "</span></span>" + K.icon("arrow-up-left", "icon-sm text-ink-300") + "</a>";
      });
      h += '<a class="flex min-h-12 items-center justify-center gap-1.5 border-t border-ink-100 p-3 text-sm font-bold text-ink-950 hover:bg-linen-100" href="/search?q=' + encodeURIComponent(q) + '">دیدن همه نتایج «' + K.esc(q) + '» ' + K.icon("arrow-left", "icon-sm") + "</a>";
      show(h);
    }

    input.addEventListener("input", function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 2) { show(isDropdown ? "" : emptyHTML); return; }
      timer = setTimeout(function () {
        var my = ++seq;
        if (!isDropdown || !box.innerHTML) show('<div class="space-y-3 p-4">' + [1, 2, 3].map(function () { return '<div class="flex items-center gap-3"><div class="skeleton h-14 w-11"></div><div class="flex-1 space-y-2"><div class="skeleton h-3.5 w-2/3"></div><div class="skeleton h-3 w-1/3"></div></div></div>'; }).join("") + "</div>");
        K.api("/api/search/suggest?q=" + encodeURIComponent(q))
          .then(function (d) { if (my === seq) render(q, d); })
          .catch(function () { if (my === seq) show('<div class="m-4 alert alert-danger">' + K.icon("alert", "icon-sm mt-1 shrink-0") + "<span>جستجو انجام نشد. اتصال اینترنت را بررسی کنید و دوباره بنویسید.</span></div>"); });
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
    form.addEventListener("submit", function (e) {
      var q = input.value.trim();
      if (!q) { e.preventDefault(); return; }
      K.recentSearches([q].concat(K.recentSearches().filter(function (x) { return x !== q; })).slice(0, 6));
    });
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
    var hd = $("[data-auth-heading]");
    if (hd) hd.textContent = step === "code" ? "کد تأیید را وارد کنید" : "ورود یا ثبت‌نام";
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
        if (K.syncOtp) K.syncOtp();
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
        if (otp && otp.code) { var c = $("#auth-code"); c.value = otp.code; if (K.syncOtp) K.syncOtp(); $('[data-auth-step="code"]').requestSubmit(); }
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
    var otpBox = $("[data-otp]"), cells = $$(".otp-cell", otpBox);
    K.syncOtp = function () {
      var v = codeInput.value;
      cells.forEach(function (c, i) {
        c.textContent = v[i] ? K.fa(v[i]) : "";
        c.classList.toggle("is-filled", !!v[i]);
        c.classList.toggle("is-current", i === Math.min(v.length, 4));
      });
      otpBox.removeAttribute("data-invalid");
    };
    codeInput.addEventListener("input", function () {
      codeInput.value = K.toEn(codeInput.value).replace(/\D/g, "").slice(0, 5);
      K.syncOtp();
      if (codeInput.value.length === 5) codeForm.requestSubmit();
    });
    ["focus", "click", "keyup"].forEach(function (ev) {
      codeInput.addEventListener(ev, function () { codeInput.setSelectionRange(codeInput.value.length, codeInput.value.length); K.syncOtp(); });
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
          btn.querySelector(".btn-label-idle").textContent = "وارد شدید ✓";
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
          codeInput.value = "";
          K.syncOtp();
          otpBox.setAttribute("data-invalid", "");
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

  /* ───────── Password show/hide ───────── */
  $$('input[type="password"]').forEach(function (input) {
    var wrap = document.createElement("div");
    wrap.className = "relative";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.classList.add("pe-12");
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn-icon absolute inset-y-0 end-0.5 my-auto size-10 text-ink-500";
    b.setAttribute("aria-label", "نمایش رمز عبور");
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = K.icon("eye", "icon-sm");
    b.addEventListener("click", function () {
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      b.setAttribute("aria-pressed", show ? "true" : "false");
      b.setAttribute("aria-label", show ? "پنهان کردن رمز عبور" : "نمایش رمز عبور");
    });
    wrap.appendChild(b);
  });

  /* ───────── Header: hairline once the page scrolls ───────── */
  var header = $("[data-site-header]");
  if (header) {
    var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 4); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ───────── Navigation progress bar (full page loads feel instant, not frozen) ───────── */
  var bar = $("[data-nav-progress]");
  function startProgress() { if (bar) { bar.classList.remove("is-active"); void bar.offsetWidth; bar.classList.add("is-active"); } }
  document.addEventListener("click", function (e) {
    var a = e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target === "_blank" || a.hasAttribute("download")) return;
    var u = new URL(a.href, location.href);
    if (u.origin !== location.origin || (u.pathname === location.pathname && u.search === location.search)) return;
    startProgress();
  });
  document.addEventListener("submit", function (e) { if (!e.defaultPrevented && e.target.method === "get") startProgress(); });
  window.addEventListener("pageshow", function () { if (bar) bar.classList.remove("is-active"); });

  /* ───────── Tabs (WAI-ARIA pattern: arrows move, Home/End jump) ───────── */
  $$("[data-tabs]").forEach(function (box) {
    var tabs = $$('[role="tab"]', box);
    function select(t, focus) {
      tabs.forEach(function (x) {
        var on = x === t;
        x.setAttribute("aria-selected", on ? "true" : "false");
        x.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(x.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
      if (focus) t.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { select(t); });
      t.addEventListener("keydown", function (e) {
        var n = tabs.length, j = null;
        if (e.key === "ArrowLeft") j = (i + 1) % n; // RTL: left moves forward
        if (e.key === "ArrowRight") j = (i - 1 + n) % n;
        if (e.key === "Home") j = 0;
        if (e.key === "End") j = n - 1;
        if (j !== null) { e.preventDefault(); select(tabs[j], true); }
      });
    });
  });

  /* ───────── Quick add from product cards ───────── */
  var qa = { data: null, trigger: null };
  var qaForm = $("[data-quick-form]"), qaBody = $("[data-quick-body]");

  K.addToCart = function (body) {
    return K.api("/api/cart/items", { method: "POST", body: body }).then(function (d) {
      K.setCartCount(d.cartCount);
      return d;
    });
  };

  function qaAdded(btn) {
    if (!btn) return;
    btn.classList.add("is-added");
    btn.innerHTML = K.icon("check", "icon-sm");
    setTimeout(function () { btn.classList.remove("is-added"); btn.innerHTML = K.icon("bag-plus", "icon-sm"); }, 1800);
  }

  function qaRender(d) {
    var sizes = d.sizes || [], colors = d.colors || [];
    var off = d.final < d.price;
    var h = '<div class="flex items-center gap-3">' +
      (d.image ? '<img src="' + K.esc(d.image) + '" alt="" class="h-20 w-16 shrink-0 rounded-sm bg-linen-100 object-cover">' : "") +
      '<div class="min-w-0"><p class="line-clamp-2 text-sm font-semibold leading-6 text-ink-950">' + K.esc(d.name) + "</p>" +
      '<p class="mt-0.5 flex items-baseline gap-2"><span class="price ' + (off ? "price-sale" : "") + '">' + K.price(d.final) + '<span class="currency">تومان</span></span>' + (off ? '<span class="price-old">' + K.price(d.price) + "</span>" : "") + "</p>" +
      '<a class="link text-xs" href="/productDetails/' + encodeURIComponent(d.slug) + '">جزئیات کامل محصول</a></div></div>';
    if (colors.length > 1) {
      h += '<fieldset><legend class="mb-2.5 text-sm font-bold">رنگ: <span class="font-medium text-ink-600" data-qa-color-label>انتخاب کنید</span></legend><div class="flex flex-wrap gap-3 ps-1">' +
        colors.map(function (c) {
          var bg = /^#[0-9a-f]{3,8}$/i.test(c.rgb) ? c.rgb : "#eee";
          return '<label class="swatch" style="background:' + bg + '" title="' + K.esc(c.name) + '"><input type="radio" name="color" value="' + K.esc(c.name) + '"><span class="sr-only">' + K.esc(c.name) + "</span></label>";
        }).join("") + '</div><p class="field-error mt-2" data-qa-err="color" hidden></p></fieldset>';
    }
    if (sizes.length > 1) {
      h += '<fieldset><legend class="mb-2.5 text-sm font-bold">سایز: <span class="font-medium text-ink-600" data-qa-size-label>انتخاب کنید</span></legend><div class="grid grid-cols-3 gap-2 xs:grid-cols-4">' +
        sizes.map(function (s) {
          return '<label class="opt"><input type="radio" name="size" value="' + K.esc(s.size) + '" data-usage="' + K.esc(s.usage) + '"><span>' + K.esc(s.size) + "</span>" + (s.usage ? '<span class="opt-sub">' + K.esc(s.usage) + "</span>" : "") + "</label>";
        }).join("") + '</div><p class="field-error mt-2" data-qa-err="size" hidden></p></fieldset>';
    }
    qaBody.innerHTML = h;
    $("#qa-title").textContent = sizes.length > 1 ? "سایز را انتخاب کنید" : "انتخاب رنگ";
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-quick-add]");
    if (!b) return;
    e.preventDefault();
    var d;
    try { d = JSON.parse(b.getAttribute("data-quick-add")); } catch (err) { return; }
    qa.data = d; qa.trigger = b;
    var needsChoice = (d.sizes || []).length > 1 || (d.colors || []).length > 1;
    if (!needsChoice || !qaForm) {
      K.setLoading(b, true);
      K.addToCart({ productId: d.id, quantity: 1, size: (d.sizes[0] || {}).size || "", color: (d.colors[0] || {}).name || "" })
        .then(function () { qaAdded(b); K.toast("«" + d.name + "» به سبد اضافه شد", "success", { action: { href: "/cart", label: "مشاهده سبد" } }); })
        .catch(function (err) { K.toast(err.message, "error"); })
        .finally(function () { K.setLoading(b, false); });
      return;
    }
    qaRender(d);
    K.open("quick-add", { focus: "input" });
  });

  if (qaForm) {
    qaForm.addEventListener("change", function (e) {
      if (e.target.name === "size") {
        var u = e.target.getAttribute("data-usage");
        $("[data-qa-size-label]", qaForm).textContent = e.target.value + (u ? " — " + u : "");
        $('[data-qa-err="size"]', qaForm).hidden = true;
      }
      if (e.target.name === "color") { $("[data-qa-color-label]", qaForm).textContent = e.target.value; $('[data-qa-err="color"]', qaForm).hidden = true; }
    });
    qaForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var d = qa.data, fd = new FormData(qaForm), bad = null;
      if (!d) return;
      [["color", "لطفاً رنگ را انتخاب کنید", d.colors], ["size", "لطفاً سایز را انتخاب کنید", d.sizes]].forEach(function (r) {
        if ((r[2] || []).length > 1 && !fd.get(r[0])) {
          var p = $('[data-qa-err="' + r[0] + '"]', qaForm);
          p.hidden = false;
          p.innerHTML = K.icon("alert", "icon-sm") + " " + r[1];
          if (!bad) bad = $('input[name="' + r[0] + '"]', qaForm);
        }
      });
      if (bad) { bad.focus(); return; }
      var btn = $("[data-quick-submit]", qaForm);
      K.setLoading(btn, true);
      K.addToCart({ productId: d.id, quantity: 1, size: fd.get("size") || ((d.sizes[0] || {}).size || ""), color: fd.get("color") || ((d.colors[0] || {}).name || "") })
        .then(function () {
          K.close();
          qaAdded(qa.trigger);
          K.toast("«" + d.name + "» به سبد اضافه شد", "success", { action: { href: "/cart", label: "مشاهده سبد" } });
        })
        .catch(function (err) { K.toast(err.message, "error"); })
        .finally(function () { K.setLoading(btn, false); });
    });
  }

  /* ───────── Boot ───────── */
  var params = new URLSearchParams(location.search);
  if (params.get("login") === "1" && !K.user) {
    // Wait a tick so history state for the overlay is pushed after load.
    setTimeout(function () { K.openAuth(); }, 50);
  }
  var flash = params.get("msg");
  if (flash) K.toast(flash, "info");
})();
