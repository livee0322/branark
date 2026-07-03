window.BRANARK_CLOSING_LEDGER_CONFIG = {
  appsScriptWebAppUrl: 'https://script.google.com/macros/s/AKfycbz86pVCWFnXmHLjr6d8Cm2HCgF8MrG33903-ivG3UbHTcfCc8xpNuSj7Aa91m15NOeo2Q/exec',
  maxFileSizeBytes: 8 * 1024 * 1024,
  healthTimeoutMs: 15000,
  requestTimeoutMs: 120000,
};

(function patchAppsScriptPostMessageUpload() {
  function mapAppsScriptUploadError(payload) {
    const error = new Error(payload?.userMessage || payload?.error || payload?.message || 'Apps Script 처리 중 오류가 발생했습니다.');
    error.code = payload?.errorCode || payload?.code || '';
    error.userMessage = payload?.userMessage || '';
    error.details = payload?.details || '';
    error.errors = payload?.errors || [];
    error.payload = payload;
    return error;
  }

  function patchedSubmitToAppsScript(url, payload) {
    return new Promise((resolve, reject) => {
      const callbackId = `branark_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const iframeName = `${callbackId}_frame`;
      const iframe = document.createElement('iframe');
      iframe.name = iframeName;
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      let messageReceived = false;
      let iframeLoaded = false;
      const requestTimeoutMs = Number(window.BRANARK_CLOSING_LEDGER_CONFIG?.requestTimeoutMs || 120000);
      const timeoutId = window.setTimeout(() => {
        cleanup();
        const error = new Error('UPLOAD_TIMEOUT');
        error.code = 'UPLOAD_TIMEOUT';
        error.details = iframeLoaded
          ? 'Apps Script 화면은 열렸지만 postMessage 응답을 받지 못했습니다.'
          : 'Apps Script 요청 자체가 완료되지 않았습니다.';
        reject(error);
      }, requestTimeoutMs);

      function cleanup() {
        window.clearTimeout(timeoutId);
        window.removeEventListener('message', onMessage);
        iframe.removeEventListener('load', onLoad);
        const form = document.querySelector(`[data-callback-id="${callbackId}"]`);
        if (form) {
          form.remove();
        }
        iframe.remove();
      }

      function onLoad() {
        iframeLoaded = true;
        window.setTimeout(() => {
          if (!messageReceived) {
            const messageNode = document.querySelector('#uploadMessage');
            if (messageNode) {
              messageNode.textContent = 'Apps Script 처리 결과를 기다리고 있습니다. 파일이 큰 경우 시간이 걸릴 수 있습니다.';
            }
          }
        }, 3000);
      }

      function onMessage(event) {
        const data = event.data;
        if (!data || data.callbackId !== callbackId) {
          return;
        }

        messageReceived = true;
        cleanup();

        if (data.ok) {
          resolve(data);
          return;
        }

        const mapper = typeof mapAppsScriptError === 'function' ? mapAppsScriptError : mapAppsScriptUploadError;
        reject(mapper(data));
      }

      window.addEventListener('message', onMessage);
      iframe.addEventListener('load', onLoad);

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = url;
      form.target = iframeName;
      form.dataset.callbackId = callbackId;
      form.style.display = 'none';

      const fields = {
        responseMode: 'postMessage',
        callbackId,
        source: 'branark-index-html',
        pageOrigin: window.location.origin,
        mode: 'auto-closing-ledger',
        ...payload,
      };

      Object.entries(fields).forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = typeof value === 'boolean' ? String(value) : String(value ?? '');
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
    });
  }

  window.setTimeout(() => {
    try {
      submitToAppsScript = patchedSubmitToAppsScript;
    } catch (error) {
      window.submitToAppsScript = patchedSubmitToAppsScript;
    }
  }, 0);
})();