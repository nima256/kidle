(function () {
  "use strict";
  var K = window.KIDLE, $ = K.$;
  var f = $("[data-profile-form]");
  if (!f) return;
  f.addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("button", f);
    ["fullName", "email"].forEach(function (k) { var p = $('[data-err="' + k + '"]', f); p.hidden = true; f.elements[k].removeAttribute("aria-invalid"); });
    K.setLoading(btn, true);
    K.api("/api/account/profile", { method: "PATCH", body: { fullName: f.fullName.value, email: f.email.value } })
      .then(function (d) { K.toast(d.message, "success"); })
      .catch(function (err) {
        var errors = (err.data && err.data.errors) || {};
        Object.keys(errors).forEach(function (k) { var p = $('[data-err="' + k + '"]', f); if (p) { p.hidden = false; p.textContent = errors[k]; f.elements[k].setAttribute("aria-invalid", "true"); } });
        K.toast(err.message, "error");
      })
      .finally(function () { K.setLoading(btn, false); });
  });
})();
