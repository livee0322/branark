(function branarkClosingLedgerUploadPatch() {
  const runtimeConfig = window.BRANARK_CLOSING_LEDGER_CONFIG || {};
  const requestTimeoutMs = Number(runtimeConfig.requestTimeoutMs || 180000);
  const pollIntervalMs = 3000;
  const appsScriptWebAppUrl = String(runtimeConfig.appsScriptWebAppUrl || '').trim();
  const xlsxLibraryUrl = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  let xlsxLibraryPromise = null;

  function qs(selector) {
    return document.querySelector(selector);
  }

  function prettyJson(value) {
    return JSON.stringify(value ?? {}, null, 2);
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

  function setDeveloperProcess(value) {
    const node = qs('#developerProcessOutput');
    if (node) node.textContent = prettyJson(value || {});
  }

  function getFileExtension(fileName) {
    return String(fileName || '').includes('.') ? String(fileName).split('.').pop().toLowerCase() : '';
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

  function loadXlsxLibrary() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxLibraryPromise) return xlsxLibraryPromise;
    xlsxLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = xlsxLibraryUrl;
      script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('XLSX_LIBRARY_NOT_LOADED'));
      script.onerror = () => reject(new Error('XLSX_LIBRARY_LOAD_FAILED'));
      document.head.appendChild(script);
    });
    return xlsxLibraryPromise;
  }

  async function addClientWorkbookPayload(payload) {
    const extension = getFileExtension(payload.fileName);
    if (!['xlsx', 'xls'].includes(extension) || !payload.fileBase64) {
      return payload;
    }

    setUploadMessage('엑셀 파일 내용을 브라우저에서 먼저 읽고 있습니다.');
    const XLSX = await loadXlsxLibrary();
    const workbook = XLSX.read(payload.fileBase64, { type: 'base64', cellDates: false, raw: false });
    const sheets = workbook.SheetNames.map((sheetName) => {
      const values = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        raw: false,
        defval: '',
        blankrows: false,
      });
      return {
        name: sheetName,
        values,
      };
    }).filter((sheet) => sheet.values && sheet.values.length);

    return {
      ...payload,
      clientWorkbookParsedInBrowser: true,
      clientWorkbookJson: JSON.stringify({ sheets }),
    };
  }

  function fetchJsonp(url, params) {
    return new Promise((resolve, reject) => {
      const callbackName = `branarkPoll_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      const timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error('RESULT_POLL_TIMEOUT'));
      }, 20000);

      function cleanup() {
        window.clearTimeout(timeoutId);
        delete window[callbackName];
        script.remove();
      }

      window[callbackName] = (result) => {
        cleanup();
        resolve(result);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error('RESULT_POLL_FAILED'));
      };

      const target = new URL(url);
      Object.entries(params || {}).forEach(([key, value]) => target.searchParams.set(key, String(value ?? '')));
      target.searchParams.set('callback', callbackName);
      script.src = target.toString();
      document.body.appendChild(script);
    });
  }

  function patchedSubmitToAppsScript(url, payload) {
    return new Promise(async (resolve, reject) => {
      const callbackId = `branark_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const iframeName = `${callbackId}_frame`;
      const iframe = document.createElement('iframe');
      iframe.name = iframeName;
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      let completed = false;
      let messageReceived = false;
      let iframeLoaded = false;
      let pollAttempts = 0;
      let pollTimer = null;

      const timeoutId = window.setTimeout(() => {
        finishWithError({
          code: 'UPLOAD_TIMEOUT',
          message: iframeLoaded
            ? 'Apps Script 처리 화면은 열렸지만 결과를 받지 못했습니다.'
            : 'Apps Script 요청 자체가 완료되지 않았습니다.',
        });
      }, requestTimeoutMs);

      function cleanup() {
        window.clearTimeout(timeoutId);
        if (pollTimer) window.clearInterval(pollTimer);
        window.removeEventListener('message', onMessage, false);
        iframe.removeEventListener('load', onLoad);
        const form = document.querySelector(`[data-callback-id="${callbackId}"]`);
        if (form) form.remove();
        iframe.remove();
      }

      function finishWithResult(result, source) {
        if (completed) return;
        completed = true;
        cleanup();
        setDeveloperRaw(result);
        setDeveloperProcess({ callbackId, source, postMessageReceived: messageReceived, pollingAttempts: pollAttempts });
        resolve(result);
      }

      function finishWithError(payload) {
        if (completed) return;
        completed = true;
        cleanup();
        const errorPayload = payload && payload.errorCode ? payload : {
          ok: false,
          errorCode: payload?.code || 'UPLOAD_TIMEOUT',
          userMessage: payload?.message || 'Apps Script 처리 결과를 받지 못했습니다.',
          details: payload?.message || '',
          callbackId,
        };
        setDeveloperRaw(errorPayload);
        setDeveloperProcess({ callbackId, postMessageReceived: messageReceived, pollingAttempts: pollAttempts, error: errorPayload });
        const mapper = typeof window.mapAppsScriptError === 'function' ? window.mapAppsScriptError : mapAppsScriptUploadError;
        reject(mapper(errorPayload));
      }

      async function pollResult() {
        if (completed) return;
        pollAttempts += 1;
        setDeveloperProcess({ callbackId, postMessageReceived: messageReceived, pollingAttempts: pollAttempts, status: 'polling' });
        try {
          const result = await fetchJsonp(url, { action: 'result', callbackId });
          if (!result) return;
          setDeveloperRaw(result);
          if (result.pending) {
            setUploadMessage(`Apps Script 처리 결과를 기다리고 있습니다. 조회 ${pollAttempts}회`);
            return;
          }
          if (result.ok) {
            finishWithResult(result, 'polling');
          } else {
            finishWithError(result);
          }
        } catch (error) {
          setDeveloperProcess({ callbackId, postMessageReceived: messageReceived, pollingAttempts: pollAttempts, pollingError: error.message || String(error) });
        }
      }

      function onLoad() {
        iframeLoaded = true;
        window.setTimeout(() => {
          if (!completed && !messageReceived) {
            setUploadMessage('Apps Script에서 파일을 처리하고 있습니다. 결과 조회를 함께 진행합니다.');
          }
        }, 3000);
      }

      function onMessage(event) {
        const data = event.data;
        if (!data || data.callbackId !== callbackId) return;
        messageReceived = true;
        if (data.ok) {
          finishWithResult(data, 'postMessage');
          return;
        }
        finishWithError(data);
      }

      try {
        payload = await addClientWorkbookPayload(payload);
      } catch (error) {
        finishWithError({ code: 'CLIENT_EXCEL_PARSE_FAILED', message: '브라우저에서 엑셀 파일을 읽지 못했습니다.', details: error.message || String(error) });
        return;
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
        jobId: callbackId,
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
      pollTimer = window.setInterval(pollResult, pollIntervalMs);
      window.setTimeout(pollResult, 1500);
      form.submit();
    });
  }

  function fetchHealthForPricePreview() {
    if (!appsScriptWebAppUrl) return;
    fetchJsonp(appsScriptWebAppUrl, { action: 'health' })
      .then((result) => renderPricePreviewRows(result?.price?.previewRows || []))
      .catch(() => {});
  }

  function renderPricePreviewRows(previewRows) {
    const tbody = qs('#priceMatchTableBody');
    const message = qs('#priceVerificationMessage');
    if (!tbody || !previewRows.length) return;
    if (tbody.textContent && !tbody.textContent.includes('아직 단가 검증 결과가 없습니다.')) return;

    if (message) {
      message.textContent = '공급단가표 상위 일부 가격입니다. 발주서 업로드 후 발주 수량과 공급가 합계가 함께 표시됩니다.';
    }

    tbody.innerHTML = previewRows.map((row) => `
      <tr>
        <td>-</td>
        <td>${escapeHtml(row[0] || '-')}</td>
        <td>${escapeHtml(row[1] || '-')}</td>
        <td>${escapeHtml(formatCurrency(row[2]))}</td>
        <td>${escapeHtml(formatCurrency(row[3]))}</td>
        <td>-</td>
        <td>-</td>
        <td>단가표 확인용</td>
      </tr>
    `).join('');
  }

  function install() {
    try {
      window.submitToAppsScript = patchedSubmitToAppsScript;
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