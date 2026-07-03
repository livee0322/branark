const fileInput = document.querySelector('#orderFile');
const fileName = document.querySelector('#fileName');
const resultFileName = document.querySelector('#resultFileName');
const resultFileId = document.querySelector('#resultFileId');
const resultSheetName = document.querySelector('#resultSheetName');
const resultRow = document.querySelector('#resultRow');
const resultOutput = document.querySelector('#resultOutput');
const validateButton = document.querySelector('#validateButton');
const uploadMessage = document.querySelector('#uploadMessage');
const statusItems = Array.from(document.querySelectorAll('#statusList li'));

const appsScriptUrlInput = document.querySelector('#appsScriptUrl');
const appsScriptTokenInput = document.querySelector('#appsScriptToken');
const rememberSettingsInput = document.querySelector('#rememberSettings');
const orderDateInput = document.querySelector('#orderDate');
const productNameInput = document.querySelector('#productName');
const quantityInput = document.querySelector('#quantity');
const supplyPriceInput = document.querySelector('#supplyPrice');
const allowDuplicateInput = document.querySelector('#allowDuplicateFile');

const allowedExtensions = ['xlsx', 'xls', 'csv'];
const storageKey = 'branarkClosingLedgerAppsScriptUrl';

function getExtension(name) {
  return name.split('.').pop().toLowerCase();
}

function setStatus(index, state, label) {
  const item = statusItems[index];
  if (!item) return;
  item.dataset.state = state;
  item.querySelector('small').textContent = label;
}

function resetStatus() {
  statusItems.forEach((item) => {
    item.dataset.state = 'waiting';
    item.querySelector('small').textContent = '대기';
  });
}

function setToday() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  if (orderDateInput && !orderDateInput.value) {
    orderDateInput.value = `${yyyy}-${mm}-${dd}`;
  }
}

function restoreSettings() {
  const savedUrl = window.localStorage.getItem(storageKey);
  if (savedUrl && appsScriptUrlInput) {
    appsScriptUrlInput.value = savedUrl;
    rememberSettingsInput.checked = true;
  }
}

function normalizeAppsScriptUrl(url) {
  return String(url || '').trim();
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      const base64 = value.includes(',') ? value.split(',').pop() : value;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('파일을 읽는 중 오류가 발생했습니다.'));
    reader.readAsDataURL(file);
  });
}

function submitToAppsScript(url, payload) {
  return new Promise((resolve, reject) => {
    const callbackId = `branark_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const iframeName = `${callbackId}_frame`;
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Apps Script 응답 시간이 초과되었습니다. 배포 URL과 권한을 확인해주세요.'));
    }, 120000);

    function cleanup() {
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      const form = document.querySelector(`[data-callback-id="${callbackId}"]`);
      const iframe = document.querySelector(`iframe[name="${iframeName}"]`);
      if (form) form.remove();
      if (iframe) iframe.remove();
    }

    function onMessage(event) {
      const data = event.data;
      if (!data || data.callbackId !== callbackId) return;
      cleanup();
      if (data.ok) {
        resolve(data);
      } else {
        reject(new Error(data.error || 'Apps Script 처리에 실패했습니다.'));
      }
    }

    window.addEventListener('message', onMessage);

    const iframe = document.createElement('iframe');
    iframe.name = iframeName;
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    form.target = iframeName;
    form.dataset.callbackId = callbackId;
    form.style.display = 'none';

    const fields = {
      responseMode: 'postMessage',
      callbackId,
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

function setResult(result) {
  resultFileName.textContent = result.fileName || '-';
  resultFileId.textContent = result.fileId || '-';
  resultSheetName.textContent = [result.spreadsheetTitle, result.sheetName].filter(Boolean).join(' / ') || '-';
  resultRow.textContent = result.appendedRow || '-';
  resultOutput.textContent = JSON.stringify(result, null, 2);
}

function setError(error) {
  resultOutput.textContent = error?.message || String(error);
}

fileInput.addEventListener('change', () => {
  resetStatus();
  const file = fileInput.files?.[0];
  if (!file) {
    fileName.textContent = '파일을 선택하세요';
    resultFileName.textContent = '-';
    uploadMessage.textContent = 'Apps Script Web App URL, API Token, 파일을 입력한 뒤 실행하세요.';
    return;
  }

  fileName.textContent = file.name;
  resultFileName.textContent = file.name;

  const extension = getExtension(file.name);
  if (!allowedExtensions.includes(extension)) {
    uploadMessage.textContent = '지원하지 않는 파일 형식입니다. xlsx, xls, csv 파일만 사용할 수 있습니다.';
    setStatus(0, 'error', '실패');
    return;
  }

  uploadMessage.textContent = '파일 형식은 정상입니다. Apps Script로 업로드 및 시트 작성을 실행할 수 있습니다.';
  setStatus(0, 'success', '성공');
});

validateButton.addEventListener('click', async () => {
  const file = fileInput.files?.[0];
  const url = normalizeAppsScriptUrl(appsScriptUrlInput.value);
  const apiToken = appsScriptTokenInput.value.trim();

  resetStatus();
  resultOutput.textContent = '처리 중입니다...';

  try {
    if (!url) {
      throw new Error('Apps Script Web App URL을 입력해주세요.');
    }

    if (!url.startsWith('https://script.google.com/') || !url.includes('/exec')) {
      throw new Error('Apps Script Web App URL은 https://script.google.com/.../exec 형식이어야 합니다.');
    }

    if (!apiToken) {
      throw new Error('API Token을 입력해주세요.');
    }

    if (!file) {
      throw new Error('먼저 발주서 파일을 선택해주세요.');
    }

    const extension = getExtension(file.name);
    if (!allowedExtensions.includes(extension)) {
      setStatus(0, 'error', '실패');
      throw new Error('지원하지 않는 파일 형식입니다.');
    }

    const quantity = Number(quantityInput.value);
    const supplyPrice = Number(supplyPriceInput.value);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('수량은 1 이상의 숫자여야 합니다.');
    }

    if (!Number.isFinite(supplyPrice) || supplyPrice < 0) {
      throw new Error('공급단가는 0 이상의 숫자여야 합니다.');
    }

    validateButton.disabled = true;
    validateButton.textContent = '처리 중...';

    if (rememberSettingsInput.checked) {
      window.localStorage.setItem(storageKey, url);
    } else {
      window.localStorage.removeItem(storageKey);
    }

    setStatus(0, 'success', '성공');
    setStatus(1, 'processing', '연결 중');
    uploadMessage.textContent = '파일을 읽고 Apps Script로 전송 중입니다.';

    const fileBase64 = await readFileAsBase64(file);

    setStatus(1, 'success', '성공');
    setStatus(2, 'processing', '확인 중');
    setStatus(3, 'processing', '업로드 중');

    const result = await submitToAppsScript(url, {
      apiToken,
      testFileName: file.name,
      fileName: file.name,
      fileMimeType: file.type || 'application/octet-stream',
      fileBase64,
      orderDate: orderDateInput.value,
      productName: productNameInput.value.trim(),
      quantity,
      supplyPrice,
      allowDuplicateFile: allowDuplicateInput.checked,
    });

    setStatus(2, 'success', '성공');
    setStatus(3, 'success', '성공');
    setStatus(4, 'success', '성공');
    setStatus(5, 'success', '성공');
    setResult(result);
    uploadMessage.textContent = '완료되었습니다. Drive 파일 생성과 일일 마감 양식 작성 결과를 확인하세요.';
  } catch (error) {
    const message = error?.message || String(error);
    uploadMessage.textContent = message;
    setError(error);

    if (message.includes('DUPLICATE_FILE_NAME')) {
      setStatus(2, 'error', '중복');
    } else if (message.includes('Drive') || message.includes('파일')) {
      setStatus(3, 'error', '실패');
    } else if (message.includes('Sheet') || message.includes('시트')) {
      setStatus(5, 'error', '실패');
    } else {
      setStatus(1, 'error', '실패');
    }
  } finally {
    validateButton.disabled = false;
    validateButton.textContent = 'Apps Script로 업로드 및 시트 작성';
  }
});

setToday();
restoreSettings();
