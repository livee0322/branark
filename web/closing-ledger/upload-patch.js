(function branarkClosingLedgerUploadPatch() {
  const runtimeConfig = window.BRANARK_CLOSING_LEDGER_CONFIG || {};
  const requestTimeoutMs = Number(runtimeConfig.requestTimeoutMs || 180000);
  const appsScriptWebAppUrl = String(runtimeConfig.appsScriptWebAppUrl || '').trim();

  function qs(selector) {
    return document.querySelector(selector);
  }

  function prettyJson(value) {
    return JSON.stringify(value ?? {}, null, 2);
  }

  function formatNumber(value) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return '-';
    return new Intl.NumberFormat('ko-KR').format(numberValue);
  }

  function formatCurrency(value) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return '-';
    return `${new Intl.NumberFormat('ko-KR').format(numberValue)}원`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setUploadMessage(message) {
    const node = qs('#uploadMessage');
    if (node) node.textContent = message;
  }

  function setDeveloperRaw(value) {
    const raw = qs('#developerRawOutput');
    if (raw) raw.textContent = prettyJson(value || {});
  }

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
      const timeoutId = window.setTimeout(() => {
        cleanup();
        const error = new Error('UPLOAD_TIMEOUT');
        error.code = 'UPLOAD_TIMEOUT';
        error.details = iframeLoaded
          ? 'Apps Script 처리 화면은 열렸지만 결과 메시지를 받지 못했습니다. Google Web App 응답 또는 파일 처리 오류를 확인해 주세요.'
          : 'Apps Script 요청 자체가 완료되지 않았습니다.';
        reject(error);
      }, requestTimeoutMs);

      function cleanup() {
        window.clearTimeout(timeoutId);
        window.removeEventListener('message', onMessage, false);
        iframe.removeEventListener('load', onLoad);
        const form = document.querySelector(`[data-callback-id="${callbackId}"]`);
        if (form) form.remove();
        iframe.remove();
      }

      function onLoad() {
        iframeLoaded = true;
        window.setTimeout(() => {
          if (!messageReceived) {
            setUploadMessage('Apps Script에서 파일을 처리하고 있습니다. 엑셀 변환과 단가 검증에 시간이 걸릴 수 있습니다.');
          }
        }, 3000);
      }

      function onMessage(event) {
        const data = event.data;
        if (!data || data.callbackId !== callbackId) return;

        messageReceived = true;
        cleanup();
        setDeveloperRaw(data);

        if (data.ok) {
          resolve(data);
          return;
        }

        const mapper = typeof window.mapAppsScriptError === 'function' ? window.mapAppsScriptError : mapAppsScriptUploadError;
        reject(mapper(data));
      }

      window.addEventListener('message', onMessage, false);
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

  function fetchHealthForPricePreview() {
    if (!appsScriptWebAppUrl) return;
    const callbackName = `branarkPricePreview_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');

    window[callbackName] = (result) => {
      try {
        renderPricePreviewRows(result?.price?.previewRows || []);
      } finally {
        delete window[callbackName];
        script.remove();
      }
    };

    script.onerror = () => {
      delete window[callbackName];
      script.remove();
    };

    const target = new URL(appsScriptWebAppUrl);
    target.searchParams.set('action', 'health');
    target.searchParams.set('callback', callbackName);
    script.src = target.toString();
    document.body.appendChild(script);
  }

  function renderPricePreviewRows(previewRows) {
    const tbody = qs('#priceMatchTableBody');
    const message = qs('#priceVerificationMessage');
    if (!tbody || !previewRows.length) return;
    if (tbody.textContent && !tbody.textContent.includes('아직 단가 검증 결과가 없습니다.')) return;

    if (message) {
      message.textContent = '공급단가표 상위 일부 가격입니다. 발주서 업로드 후 발주 수량과 공급가 합계가 함께 표시됩니다.';
    }

    tbody.innerHTML = previewRows.map((row) => {
      const productName = row[0] || '-';
      const spec = row[1] || '-';
      const supplyPrice = row[2];
      const vat = row[3];
      return `
        <tr>
          <td>-</td>
          <td>${escapeHtml(productName)}</td>
          <td>${escapeHtml(spec)}</td>
          <td>${escapeHtml(formatCurrency(supplyPrice))}</td>
          <td>${escapeHtml(formatCurrency(vat))}</td>
          <td>-</td>
          <td>-</td>
          <td>단가표 확인용</td>
        </tr>
      `;
    }).join('');
  }

  function install() {
    try {
      window.submitToAppsScript = patchedSubmitToAppsScript;
      // Non-module script function declarations are writable global bindings in normal browser execution.
      // eslint-disable-next-line no-global-assign
      submitToAppsScript = patchedSubmitToAppsScript;
    } catch (error) {
      window.submitToAppsScript = patchedSubmitToAppsScript;
    }
    fetchHealthForPricePreview();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
})();