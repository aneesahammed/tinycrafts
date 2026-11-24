/* Plain-language help for AI problems: what happened, and what to do next.
   Chat, Mindmap and Settings all speak through this file, so the same
   problem always reads the same way. */
(function (root, factory) {
  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.MarkVAiHelp = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var LABELS = { ollama: "Ollama", groq: "Groq", openrouter: "OpenRouter" };
  var PROBE_TIMEOUT_MS = 4000;
  // Named in the download step when no model is installed.
  var SUGGESTED_MODEL = "gemma3";

  function problemError(code, message) {
    var error = new Error(message || code);
    error.code = code;
    return error;
  }

  // ---- Where are we running ----
  function detectPlatform(nav) {
    var ua = String((nav && nav.userAgent) || "");
    if (/Android|iPhone|iPad|iPod/i.test(ua)) return "mobile";
    // iPadOS reports itself as a Mac; a Mac has no touch screen.
    if (/Macintosh/i.test(ua)) return nav.maxTouchPoints > 1 ? "mobile" : "mac";
    if (/Windows/i.test(ua)) return "windows";
    return "linux";
  }

  // Chrome asks before a website may reach this computer. While that
  // prompt is open, requests wait for the answer.
  async function localAccessState(permissions) {
    if (!permissions || typeof permissions.query !== "function") return "unknown";
    var names = ["loopback-network", "local-network-access"];
    for (var i = 0; i < names.length; i += 1) {
      try {
        return (await permissions.query({ name: names[i] })).state;
      } catch (_error) {}
    }
    return "unknown";
  }

  async function probe(fetchFn, url, mode) {
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, PROBE_TIMEOUT_MS);
    try {
      await fetchFn(url, { mode: mode, signal: controller.signal });
      return "answered";
    } catch (_error) {
      return controller.signal.aborted ? "waiting" : "failed";
    } finally {
      clearTimeout(timer);
    }
  }

  // A request to Ollama failed without an answer. Find out why.
  // A no-cors request succeeds whenever something is listening, even if it
  // refuses this site, so it tells "refused" apart from "not running".
  async function diagnoseOllama(env) {
    if (!isOnThisComputer(env.endpoint)) return "ollama-address";
    if (env.platform === "mobile") return "ollama-mobile";
    var access = await localAccessState(env.permissions);
    if (access === "denied") return "ollama-browser-blocked";
    var candidates = ollamaEndpoints(env.endpoint);
    for (var i = 0; i < candidates.length; i += 1) {
      var url = candidates[i] + "/api/version";
      var open = await probe(env.fetch, url, "cors");
      if (open === "answered") return "interrupted";
      // Still waiting on the browser's own permission prompt.
      if (open === "waiting" && access === "prompt") return "ollama-browser-blocked";
      if ((await probe(env.fetch, url, "no-cors")) === "answered") {
        return originForCommand(env.origin) ? "ollama-not-allowed" : "ollama-unreachable";
      }
    }
    // Some browsers stop https pages from reaching http://localhost. Without
    // a permission to read, that looks exactly like "not running".
    var mayBeBrowser = /^https:/.test(String(env.origin)) && access === "unknown";
    return mayBeBrowser ? "ollama-unreachable" : "ollama-closed";
  }

  function isOnThisComputer(endpoint) {
    try {
      var url = new URL(endpoint);
      return /^https?:$/.test(url.protocol) && /^(localhost|127(\.\d+){3}|\[::1\])$/.test(url.hostname);
    } catch (_error) {
      return false;
    }
  }

  // Browsers treat "localhost" and "127.0.0.1" as different origins, and
  // Ollama may accept one but not the other.
  function ollamaEndpoints(endpoint) {
    var list = [endpoint];
    if (endpoint.includes("localhost")) {
      list.push(endpoint.replace("localhost", "127.0.0.1"));
    } else if (endpoint.includes("127.0.0.1")) {
      list.push(endpoint.replace("127.0.0.1", "localhost"));
    }
    return list;
  }

  // ---- Which problem is it ----
  function classify(error, provider, online) {
    if (error && error.code) {
      return error.code === "network"
        ? provider === "ollama"
          ? "ollama-unreachable"
          : online === false
            ? "offline"
            : "provider-unreachable"
        : error.code;
    }
    var status = error && error.status;
    var message = String((error && error.message) || "");
    if (provider === "ollama") {
      if (status === 404) return "ollama-model-missing";
      if (status === 403) return "ollama-not-allowed";
    } else {
      if (status === 401 || status === 403) return "key-rejected";
      if (status === 402) return "credits";
      if (status === 413 || /request too large|context.{0,20}length|maximum context/i.test(message)) {
        return "too-large";
      }
      if (status === 429) return "rate-limited";
      if (
        status === 404 ||
        (status === 400 && /model.*(not (found|a valid)|does not exist|decommissioned)|not a valid model/i.test(message))
      ) {
        return "model-unavailable";
      }
      if (status >= 500) return "provider-down";
    }
    // The connection dropped after the answer had started.
    if (error && (error.name === "TypeError" || /network/i.test(message)) && !status) {
      return "interrupted";
    }
    return "unknown";
  }

  // ---- Commands ----
  // Only a real web address goes into a command people paste into a
  // terminal, and only this site's own: "*" would let any website in.
  function originForCommand(origin) {
    return /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(String(origin || "")) ? String(origin) : "";
  }

  function allowCommand(platform, origin) {
    if (platform === "windows") return 'setx OLLAMA_ORIGINS "' + origin + '"';
    if (platform === "linux") {
      return (
        "sudo mkdir -p /etc/systemd/system/ollama.service.d && " +
        "printf '[Service]\\nEnvironment=\"OLLAMA_ORIGINS=" + origin + "\"\\n' | " +
        "sudo tee /etc/systemd/system/ollama.service.d/markv.conf && " +
        "sudo systemctl daemon-reload && sudo systemctl restart ollama"
      );
    }
    return 'launchctl setenv OLLAMA_ORIGINS "' + origin + '"';
  }

  function allowSteps(platform, origin) {
    var app = platform === "windows" ? "Command Prompt" : "Terminal";
    var steps = [
      {
        text: "Paste this into " + app + " and press " + (platform === "mac" ? "Return." : "Enter."),
        command: allowCommand(platform, origin),
      },
    ];
    if (platform !== "linux") {
      steps.push({ text: "Quit Ollama, then open it again." });
    }
    return steps;
  }

  function pullCommand(model) {
    return /^[\w.:\/-]+$/.test(model || "") ? "ollama pull " + model : "";
  }

  function retryPhrase(ms) {
    if (!(ms > 0)) return "Wait a moment, then try again.";
    var seconds = Math.ceil(ms / 1000);
    if (seconds < 60) {
      return "Try again in " + seconds + (seconds === 1 ? " second." : " seconds.");
    }
    var minutes = Math.ceil(seconds / 60);
    return "Try again in " + minutes + (minutes === 1 ? " minute." : " minutes.");
  }

  // ---- The words ----
  // actions: the first one is the main button.
  function describe(code, context) {
    var ctx = context || {};
    var name = LABELS[ctx.provider] || "The AI provider";
    var site = String(ctx.origin || "").replace(/^https?:\/\//, "");
    var platform = ctx.platform || "mac";
    var origin = originForCommand(ctx.origin);
    var allow = origin ? allowSteps(platform, origin) : [];
    var rebootNote =
      platform === "mac" && allow.length
        ? "You may need to repeat this after restarting your Mac."
        : "";

    switch (code) {
      case "ollama-closed":
        return {
          title: "Ollama isn't answering",
          body: "Open the Ollama app on this computer, then try again.",
          actions: ["retry", "provider"],
        };
      case "ollama-not-allowed":
        return {
          title: "Let MarkV use Ollama",
          body: "Ollama is running, but it doesn't allow " + (site || "this site") + " yet.",
          steps: allow,
          note: rebootNote,
          actions: ["retry", "provider"],
        };
      case "ollama-unreachable":
        return {
          title: "Can't reach Ollama",
          body: "It may be closed, or it may not allow " + (site || "this site") + " yet.",
          steps: [{ text: "Open the Ollama app, then try again." }].concat(
            allow.length
              ? [{ text: "Still stuck? " + allow[0].text, command: allow[0].command }].concat(allow.slice(1))
              : [],
          ),
          note:
            "Some browsers, such as Safari, may block this. Chrome or Edge usually works." +
            (rebootNote ? " " + rebootNote : ""),
          actions: ["retry", "provider"],
        };
      case "ollama-browser-blocked":
        return {
          title: "Your browser is blocking Ollama",
          body:
            "In this site's browser settings, allow access to your local network or apps on this device. Then try again.",
          actions: ["retry", "provider"],
        };
      case "ollama-mobile":
        return {
          title: "Ollama needs a computer",
          body: "On this device, use Groq or OpenRouter instead.",
          actions: ["provider"],
        };
      case "ollama-no-models":
      case "ollama-model-missing": {
        var missing = code === "ollama-model-missing" && ctx.model;
        var command = pullCommand(missing || SUGGESTED_MODEL);
        return {
          title: missing ? missing + " isn't downloaded" : "Download a model to start",
          body: missing
            ? "Download it, or choose another model in Settings."
            : "Ollama is running, but it has no models yet.",
          steps: command
            ? [
                {
                  text:
                    "Paste this into " +
                    (platform === "windows" ? "Command Prompt" : "Terminal") +
                    ". The download can take a few minutes.",
                  command: command,
                },
              ]
            : [],
          actions: missing ? ["retry", "settings"] : ["retry", "provider"],
        };
      }
      case "ollama-address":
        return {
          title: "Check Ollama's address",
          body: "It must be on this computer, such as http://localhost:11434.",
          actions: ["settings", "retry"],
        };
      case "key-missing":
        return {
          title: "Add your " + name + " key",
          body: "MarkV needs an API key to ask " + name + ".",
          actions: ["settings", "retry"],
        };
      case "key-rejected":
        return {
          title: "Check your " + name + " key",
          body: name + " didn't accept it. It may be mistyped or expired.",
          actions: ["settings", "retry"],
        };
      case "credits":
        return {
          title: name + " needs more credits",
          body: "Add credits to your account, or choose a free model in Settings.",
          actions: ["retry", "settings"],
        };
      case "rate-limited":
        return {
          title: name + "'s limit is reached",
          body: retryPhrase(ctx.retryMs),
          actions: ["retry", "provider"],
        };
      case "too-large":
        return {
          title: "That's too much text for this model",
          body: "Ask about a smaller part, or choose another model.",
          actions: ["settings", "retry"],
        };
      case "model-unavailable":
        return {
          title: "That model isn't available",
          body: (ctx.model || "The chosen model") + " isn't offered by " + name + ". Choose another one.",
          actions: ["settings", "retry"],
        };
      case "provider-down":
        return {
          title: name + " is having trouble",
          body: "Wait a moment, then try again.",
          actions: ["retry", "provider"],
        };
      case "provider-unreachable":
        return {
          title: "Can't reach " + name,
          body: "Check your internet connection, then try again.",
          actions: ["retry", "provider"],
        };
      case "offline":
        return {
          title: "You're offline",
          body: name + " needs the internet. Reconnect, then try again.",
          actions: ["retry", "provider"],
        };
      case "interrupted":
        return {
          title: "The connection dropped",
          body: "MarkV lost contact with " + name + " before it finished. Try again.",
          actions: ["retry", "provider"],
        };
      default:
        return {
          title: "Couldn't get an answer",
          body: "Something went wrong with " + name + ". Try again.",
          detail: String(ctx.detail || "").trim().slice(0, 240),
          actions: ["retry", "provider"],
        };
    }
  }

  // ---- The card ----
  var ACTION_LABELS = {
    retry: "Try again",
    provider: "Change provider",
    settings: "Open settings",
  };

  function render(doc, problem, handlers) {
    var on = handlers || {};
    function el(tag, className, text) {
      var node = doc.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    }

    var card = el("div", "ai-help");
    card.appendChild(el("p", "ai-help__title", problem.title));
    if (problem.body) card.appendChild(el("p", "ai-help__body", problem.body));

    var steps = problem.steps || [];
    if (steps.length) {
      var list = el(steps.length > 1 ? "ol" : "div", "ai-help__steps");
      steps.forEach(function (step) {
        var item = el(steps.length > 1 ? "li" : "div", "ai-help__step", step.text);
        if (step.command) item.appendChild(commandRow(step.command));
        list.appendChild(item);
      });
      card.appendChild(list);
    }
    if (problem.detail) card.appendChild(el("p", "ai-help__note", problem.detail));

    var actions = (problem.actions || []).filter(function (name) {
      return typeof on[name] === "function";
    });
    if (actions.length) {
      var row = el("div", "ai-help__actions");
      actions.forEach(function (name, index) {
        var button = el("button", "ai-help__btn" + (index === 0 ? " is-primary" : ""), ACTION_LABELS[name]);
        button.type = "button";
        button.addEventListener("click", function () {
          on[name](button);
        });
        row.appendChild(button);
      });
      card.appendChild(row);
    }
    if (problem.note) card.appendChild(el("p", "ai-help__note", problem.note));
    return card;

    function commandRow(command) {
      var row = el("div", "ai-help__command");
      var code = el("code", "", command);
      var copy = el("button", "ai-help__copy", "Copy");
      copy.type = "button";
      copy.setAttribute("aria-label", "Copy command");
      copy.addEventListener("click", function () {
        copyText(command).then(function (copied) {
          if (copied) {
            copy.textContent = "Copied";
            setTimeout(function () {
              copy.textContent = "Copy";
            }, 1600);
            if (on.announce) on.announce("Command copied");
            return;
          }
          // No clipboard access: select it so one keystroke copies it.
          var range = doc.createRange();
          range.selectNodeContents(code);
          var selection = doc.defaultView.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          if (on.announce) on.announce("Command selected");
        });
      });
      row.appendChild(code);
      row.appendChild(copy);
      return row;
    }

    function copyText(text) {
      var clipboard = doc.defaultView.navigator.clipboard;
      if (!clipboard) return Promise.resolve(false);
      return clipboard.writeText(text).then(
        function () {
          return true;
        },
        function () {
          return false;
        },
      );
    }
  }

  // One line for a tooltip or a screen reader.
  function summarize(problem) {
    return problem.title + ". " + (problem.body || "");
  }

  return {
    SUGGESTED_MODEL: SUGGESTED_MODEL,
    problemError: problemError,
    detectPlatform: detectPlatform,
    localAccessState: localAccessState,
    ollamaEndpoints: ollamaEndpoints,
    diagnoseOllama: diagnoseOllama,
    classify: classify,
    describe: describe,
    render: render,
    summarize: summarize,
  };
});
