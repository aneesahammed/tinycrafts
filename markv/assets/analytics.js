(function () {
  "use strict";

  var hostname = window.location.hostname;
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    window.location.protocol === "file:"
  ) {
    return;
  }

  var script = document.createElement("script");

  script.async = true;
  script.dataset.goatcounter = "https://markv.goatcounter.com/count";
  script.src = "https://gc.zgo.at/count.js";
  document.head.appendChild(script);
})();
