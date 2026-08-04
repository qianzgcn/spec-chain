import { writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 页面探测使用的浏览器上下文保护层。
 *
 * 探测需要允许模型查看页面和完成必要的只读交互，但不能把页面上的
 * 提交、删除等操作真正发送到服务端。写操作统一使用非 GET 请求，
 * 因此在页面脚本层拦截后，服务端不会收到任何业务写请求。
 */
const READ_ONLY_PROBE_SCRIPT = String.raw`
(() => {
  const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
  const BLOCKED_MESSAGE =
    "SpecChain 页面探测已阻止会改变业务数据的请求";

  const normalizeMethod = (method) => String(method || "GET").toUpperCase();
  const isSafeMethod = (method) => SAFE_METHODS.has(normalizeMethod(method));

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    if (!isSafeMethod(method)) {
      console.warn(BLOCKED_MESSAGE);
      return Promise.reject(new Error(BLOCKED_MESSAGE));
    }
    return originalFetch(input, init);
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const xhrMethods = new WeakMap();
  XMLHttpRequest.prototype.open = function (method, ...args) {
    xhrMethods.set(this, normalizeMethod(method));
    return originalOpen.call(this, method, ...args);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (!isSafeMethod(xhrMethods.get(this))) {
      console.warn(BLOCKED_MESSAGE);
      this.abort();
      return;
    }
    return originalSend.call(this, ...args);
  };

  if (typeof navigator.sendBeacon === "function") {
    navigator.sendBeacon = () => {
      console.warn(BLOCKED_MESSAGE);
      return false;
    };
  }

  const formMethod = (form, submitter) =>
    normalizeMethod(submitter?.formMethod || form.method || "GET");
  const originalSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    if (!isSafeMethod(formMethod(this))) {
      throw new Error(BLOCKED_MESSAGE);
    }
    return originalSubmit.call(this);
  };

  if (typeof HTMLFormElement.prototype.requestSubmit === "function") {
    const originalRequestSubmit = HTMLFormElement.prototype.requestSubmit;
    HTMLFormElement.prototype.requestSubmit = function (submitter) {
      if (!isSafeMethod(formMethod(this, submitter))) {
        throw new Error(BLOCKED_MESSAGE);
      }
      return originalRequestSubmit.call(this, submitter);
    };
  }

  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (form instanceof HTMLFormElement && !isSafeMethod(formMethod(form))) {
        event.preventDefault();
        event.stopImmediatePropagation();
        console.warn(BLOCKED_MESSAGE);
      }
    },
    true,
  );
})();
`;

export async function writeReadOnlyProbeScript(workDir: string) {
  const scriptPath = path.join(workDir, "probe-read-only.js");
  await writeFile(scriptPath, READ_ONLY_PROBE_SCRIPT, "utf8");
  return scriptPath;
}
