(function () {
  "use strict";

  var measurementId = "G-7KS0BY50LG";
  var script = document.createElement("script");

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };

  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + measurementId;
  document.head.appendChild(script);

  window.gtag("js", new Date());
  window.gtag("config", measurementId);
})();
