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
const connectionPanel = document.querySelector('#connectionPanel');
const connectionStatus = document.querySelector('#connectionStatus');
const connectionDescription = document.querySelector('#connectionDescription');

const orderDateInput = document.querySelector('#orderDate');
const productNameInput = document.querySelector('#productName');
const quantityInput = document.querySelector('#quantity');
const supplyPriceInput = document.querySelector('#supplyPrice');
const allowDuplicateInput = document.querySelector('#allowDuplicateFile');

const healthCheckedAt = document.querySelector('#healthCheckedAt');
const healthAllowPageUpload = document.querySelector('#healthAllowPageUpload');
const healthAllowedOrigin = document.querySelector('#healthAllowedOrigin');
const healthApiToken = document.querySelector('#healthApiToken');

const healthDriveCard = document.querySelector('#healthDriveCard');
const healthDriveTitle = document.querySelector('#healthDriveTitle');
const healthDriveDescription = document.querySelector('#healthDriveDescription');
const healthDailySheetCard = document.querySelector('#healthDailySheetCard');
const healthDailySheetTitle = document.querySelector('#healthDailySheetTitle');
const healthDailySheetDescription = document.querySelector('#healthDailySheetDescription');
const healthPriceCard = document.querySelector('#healthPriceCard');
const healthPriceTitle = document.querySelector('#healthPriceTitle');
const healthPriceDescription = document.querySelector('#healthPriceDescription');
const pricePreviewBody = document.querySelector('#pricePreviewBody');
const pricePreviewDescription = document.querySelector('#pricePreviewDescription');

const allowedExtensions = ['xlsx', 'xls', 'csv'];
const runtimeConfig = window.BRANARK_CLOSING_LEDGER_CONFIG || {};
const appsScriptWebAppUrl = String(runtimeConfig.appsScriptWebAppUrl || '').trim();
const maxFileSizeBytes = Number(runtimeConfig.maxFileSizeBytes || 8 * 1024 * 1024);
const healthTimeoutMs = Number(runtimeConfig.healthTimeoutMs || 15000);
const requestTimeoutMs = Number(runtimeConfig.requestTimeoutMs || 120000);

let lastHealthResult = null;

function getExtension(name) {
  return name.includes('.') ? name.split('.').pop().toLowerCase() : '';
}

function formatNumber(value) {
  if (!Number.isFinite(Number(value))) {
    return '-';
  }
  return new Intl.NumberFormat('ko-KR').format(Number(value));
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0MB';
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }
  return String(value).replace('T', ' ');
}

function setStatus(index, state, label) {
  const item = statusItems[index];
  if (!item) {
    return;
  }
  item.dataset.state = state;
  const small = item.querySelector('small');
  if (small) {
    small.textContent = label;
  }
}

function resetStatus() {
  statusItems.forEach((item) => {
    item.dataset.state = 'waiting';
    const small = item.querySelector('small');
    if (small) {
      small.textContent = '대기';
    }
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

function setConnectionState(state, title, description) {
  if (connectionPanel) {
    connectionPanel.dataset.state = state;
  }
  if (connectionStatus) {
    connectionStatus.textContent = title;
  }
  if (connectionDescription) {
    connectionDescription.textContent = description;
  }
}

function setHealthCard(card, titleNode, descriptionNode, state, title, description) {
  if (card) {
    card.dataset.state = state;
  }
  if (titleNode) {
    titleNode.textContent = title;
  }
  if (descriptionNode) {
    descriptionNode.textContent = description;
  }
}

function setPricePreviewRows(rows, note) {
  if (!pricePreviewBody) {
    return;
  }

  if (!rows || !rows.length) {
    pricePreviewBody.innerHTML = '<tr><td colspan="2">검토용 단가표 미리보기를 불러오지 못했습니다.</td></tr>';
    if (pricePreviewDescription) {
      pricePreviewDescription.textContent = note || '단가표 파일은 접근되지만 화면 미리보기를 제공할 수 없는 상태일 수 있습니다.';
    }
    return;
  }

  const bodyRows = rows
    .map((row) => {
      const name = row[0] ? String(row[0]) : '-';
      const price = row[1] !== undefined && row[1] !== null && row[1] !== '' ? `${formatNumber(Number(row[1]))}원` : '-';
      return `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(price)}</td></tr>`;
    })
    .join('');

  pricePreviewBody.innerHTML = bodyRows;
  if (pricePreviewDescription) {
    pricePreviewDescription.textContent = note || '단가표 상위 일부 행을 검토용으로 표시하고 있습니다.';
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function validateAutomationConfig() {
  if (!appsScriptWebAppUrl) {
    setConnectionState('error', 'Apps Script URL 미설정', 'web/closing-ledger/config.js에 Apps Script /exec URL이 필요합니다.');
    if (validateButton) {
      validateButton.disabled = true;
    }
    return { ok: false, message: 'Apps Script URL이 설정되지 않았습니다.' };
  }

  if (!appsScriptWebAppUrl.startsWith('https://script.google.com/') || !appsScriptWebAppUrl.includes('/exec')) {
    setConnectionState('error', 'Apps Script URL 형식 오류', 'Apps Script Web App URL은 https://script.google.com/.../exec 형식이어야 합니다.');
    if (validateButton) {
      validateButton.disabled = true;
    }
    return { ok: false, message: 'Apps Script Web App URL 형식이 올바르지 않습니다.' };
  }

  return { ok: true };
}

async function runHealthCheck() {
  const configState = validateAutomationConfig();
  if (!configState.ok) {
    uploadMessage.textContent = configState.message;
    return;
  }

  setConnectionState('loading', '자동화 상태 점검 중', 'Apps Script health check를 실행하고 있습니다.');
  if (validateButton) {
    validateButton.disabled = true;
  }

  setHealthCard(healthDriveCard, healthDriveTitle, healthDriveDescription, 'processing', '점검 중', '발주서 저장 폴더 접근 상태를 확인하고 있습니다.');
  setHealthCard(healthDailySheetCard, healthDailySheetTitle, healthDailySheetDescription, 'processing', '점검 중', '일일마감 시트 접근 상태를 확인하고 있습니다.');
  setHealthCard(healthPriceCard, healthPriceTitle, healthPriceDescription, 'processing', '점검 중', '단가표 접근 상태를 확인하고 있습니다.');

  try {
    const result = await fetchHealthCheckJsonp(appsScriptWebAppUrl);
    if (!result || result.ok !== true) {
      throw mapAppsScriptError(result);
    }

    lastHealthResult = result;
    renderHealthResult(result);

    const isUploadReady = Boolean(result.healthOk);
    if (validateButton) {
      validateButton.disabled = !isUploadReady;
    }

    uploadMessage.textContent = isUploadReady
      ? '자동화 설정이 확인되었습니다. 파일과 입력값을 검토한 뒤 업로드를 진행하세요.'
      : '자동화 설정에 누락 또는 접근 오류가 있습니다. 화면의 점검 결과를 먼저 확인해 주세요.';
  } catch (error) {
    lastHealthResult = null;
    const message = formatUserError(error);
    setConnectionState('error', '자동화 연결 확인 실패', message);
    setHealthCard(healthDriveCard, healthDriveTitle, healthDriveDescription, 'error', '확인 실패', 'health check 응답을 받지 못했습니다.');
    setHealthCard(healthDailySheetCard, healthDailySheetTitle, healthDailySheetDescription, 'error', '확인 실패', 'health check 응답을 받지 못했습니다.');
    setHealthCard(healthPriceCard, healthPriceTitle, healthPriceDescription, 'error', '확인 실패', 'health check 응답을 받지 못했습니다.');
    setPricePreviewRows([], 'health check 실패로 단가표를 불러오지 못했습니다.');
    if (validateButton) {
      validateButton.disabled = true;
    }
    uploadMessage.textContent = message;
  }
}

function fetchHealthCheckJsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = `branarkHealth_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const timeoutId = window.setTimeout(() => {
      cleanup();
      const error = new Error('HEALTH_TIMEOUT');
      error.code = 'HEALTH_TIMEOUT';
      reject(error);
    }, healthTimeoutMs);

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
      const error = new Error('HEALTH_SCRIPT_LOAD_FAILED');
      error.code = 'HEALTH_SCRIPT_LOAD_FAILED';
      reject(error);
    };

    const target = new URL(url);
    target.searchParams.set('action', 'health');
    target.searchParams.set('callback', callbackName);
    script.src = target.toString();
    document.body.appendChild(script);
  });
}

function renderHealthResult(result) {
  const checkedAt = result.checkedAt || result.checked_at || '';
  const drive = result.drive || {};
  const dailySheet = result.dailySheet || {};
  const price = result.price || {};
  const pageUpload = result.pageUpload || {};

  if (healthCheckedAt) {
    healthCheckedAt.textContent = formatDateTime(checkedAt);
  }
  if (healthAllowPageUpload) {
    healthAllowPageUpload.textContent = pageUpload.allowPageUpload ? '허용' : '미허용';
  }
  if (healthAllowedOrigin) {
    healthAllowedOrigin.textContent = pageUpload.allowedPageOrigin || '-';
  }
  if (healthApiToken) {
    healthApiToken.textContent = result.apiTokenConfigured ? '설정됨' : '미설정';
  }

  if (result.healthOk) {
    setConnectionState('success', '자동화 연결 확인 완료', 'Apps Script 응답과 주요 Google 리소스 접근이 모두 확인되었습니다.');
  } else {
    const missing = (result.missingProperties || []).join(', ');
    const issueText = missing ? `누락 설정: ${missing}` : '세부 상태 카드를 확인해 주세요.';
    setConnectionState('error', '자동화 설정 보완 필요', issueText);
  }

  setHealthCard(
    healthDriveCard,
    healthDriveTitle,
    healthDriveDescription,
    drive.ok ? 'success' : 'error',
    drive.ok ? drive.name || '접근 가능' : '접근 실패',
    drive.ok ? `발주서 저장 폴더에 접근했습니다.${drive.id ? ` 폴더 ID: ${drive.id}` : ''}` : formatResourceIssue(drive),
  );

  setHealthCard(
    healthDailySheetCard,
    healthDailySheetTitle,
    healthDailySheetDescription,
    dailySheet.ok ? 'success' : 'error',
    dailySheet.ok ? dailySheet.spreadsheetTitle || '접근 가능' : '접근 실패',
    dailySheet.ok
      ? `${dailySheet.sheetName || '첫 번째 시트'} / 현재 마지막 행 ${dailySheet.lastRow || 0}`
      : formatResourceIssue(dailySheet),
  );

  setHealthCard(
    healthPriceCard,
    healthPriceTitle,
    healthPriceDescription,
    price.ok ? 'success' : 'error',
    price.ok ? price.name || '접근 가능' : '접근 실패',
    price.ok ? formatPriceResourceDescription(price) : formatResourceIssue(price),
  );

  setPricePreviewRows(price.previewRows || [], price.previewMessage || formatPriceResourceDescription(price));
}

function formatPriceResourceDescription(price) {
  if (!price || !price.ok) {
    return '단가표 접근 상태를 확인하지 못했습니다.';
  }

  if (price.previewAvailable) {
    const previewCount = Array.isArray(price.previewRows) ? price.previewRows.length : 0;
    return `${price.sheetName || '첫 번째 시트'} 기준 상위 ${previewCount}개 행을 표시합니다.`;
  }

  return '단가표 파일에는 접근했지만, 현재 화면 미리보기를 제공할 수 없는 형식입니다.';
}

function formatResourceIssue(resource) {
  if (!resource) {
    return '세부 오류 정보를 확인하지 못했습니다.';
  }

  if (resource.userMessage) {
    return resource.userMessage;
  }

  if (resource.errorCode) {
    return resource.errorCode;
  }

  return '세부 오류 정보를 확인하지 못했습니다.';
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
    const iframe = document.createElement('iframe');
    iframe.name = iframeName;
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    let messageReceived = false;

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('UPLOAD_TIMEOUT'));
    }, requestTimeoutMs);

    function cleanup() {
      window.clearTimeout(timeoutId);
      window.removeEventListener('message', onMessage);
      iframe.removeEventListener('load', onLoad);
      const form = document.querySelector(`[data-callback-id="${callbackId}"]`);
      if (form) {
        form.remove();
      }
      if (iframe) {
        iframe.remove();
      }
    }

    function onLoad() {
      window.setTimeout(() => {
        if (!messageReceived) {
          uploadMessage.textContent = 'Apps Script 화면은 열렸지만 응답 메시지를 받지 못했습니다. Web App 재배포, 실행 권한, ALLOWED_PAGE_ORIGIN 설정을 확인해 주세요.';
        }
      }, 3000);
    }

    function onMessage(event) {
      const data = event.data;
      if (!data || data.callbackId !== callbackId) {
        return;
      }

      if (event.source !== iframe.contentWindow) {
        return;
      }

      messageReceived = true;
      cleanup();

      if (data.ok) {
        resolve(data);
        return;
      }

      reject(mapAppsScriptError(data));
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
  const normalized = normalizeError(error);
  resultOutput.textContent = JSON.stringify(normalized, null, 2);
}

function validateForm(file) {
  if (!file) {
    throw new Error('파일을 먼저 선택해 주세요.');
  }

  const extension = getExtension(file.name);
  if (!allowedExtensions.includes(extension)) {
    throw new Error('지원하지 않는 파일 형식입니다. xlsx, xls, csv 파일만 업로드할 수 있습니다.');
  }

  if (file.size > maxFileSizeBytes) {
    throw new Error(`파일 용량은 8MB 이하여야 합니다. 현재 파일 용량은 ${formatFileSize(file.size)}입니다.`);
  }

  if (!orderDateInput.value) {
    throw new Error('주문일을 입력해 주세요.');
  }

  if (!productNameInput.value.trim()) {
    throw new Error('상품명을 입력해 주세요.');
  }

  const quantity = Number(quantityInput.value);
  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new Error('수량은 1 이상으로 입력해 주세요.');
  }

  const supplyPrice = Number(supplyPriceInput.value);
  if (!Number.isFinite(supplyPrice) || supplyPrice < 0) {
    throw new Error('공급단가는 0 이상으로 입력해 주세요.');
  }

  return {
    quantity,
    supplyPrice,
  };
}

function markValidationSuccess(file) {
  setStatus(0, 'success', `${getExtension(file.name).toUpperCase()} / ${formatFileSize(file.size)}`);
  setStatus(1, 'success', '입력값 확인 완료');
}

function mapAppsScriptError(payload) {
  const error = new Error(
    payload?.userMessage ||
      payload?.error ||
      payload?.message ||
      'Apps Script 처리 중 오류가 발생했습니다.',
  );
  error.code = payload?.errorCode || payload?.code || '';
  error.userMessage = payload?.userMessage || '';
  error.details = payload?.details || payload?.error || '';
  error.payload = payload;
  return error;
}

function normalizeError(error) {
  return {
    code: error?.code || '',
    message: formatUserError(error),
    details: error?.details || error?.message || String(error),
  };
}

function formatUserError(error) {
  const code = error?.code || '';
  const baseMessage = error?.userMessage || error?.message || String(error);
  const messageByCode = {
    CONFIG_MISSING_APPS_SCRIPT_URL: 'Apps Script URL이 설정되지 않았습니다.',
    INVALID_PAGE_ORIGIN: '이 페이지 Origin이 Apps Script 허용 목록과 맞지 않습니다. ALLOWED_PAGE_ORIGIN 설정을 확인해 주세요.',
    INVALID_API_TOKEN: '요청 인증에 실패했습니다. GitHub Actions용 API_TOKEN 또는 페이지 업로드 허용 설정을 확인해 주세요.',
    MISSING_DRIVE_FOLDER_ID: 'DRIVE_FOLDER_ID 설정이 누락되었습니다.',
    MISSING_DAILY_SHEET_ID: 'DAILY_SHEET_ID 설정이 누락되었습니다.',
    MISSING_PRICE_SHEET_ID: 'PRICE_SHEET_ID 설정이 누락되었습니다.',
    MISSING_API_TOKEN: 'API_TOKEN 설정이 누락되었습니다. GitHub Actions 연동에는 여전히 필요합니다.',
    DUPLICATE_FILE_NAME: '같은 파일명이 이미 Google Drive 폴더에 있습니다. 파일명을 바꾸거나 중복 허용을 체크해 주세요.',
    INVALID_FILE_NAME: '파일명이 비어 있습니다.',
    INVALID_QUANTITY: '수량은 1 이상이어야 합니다.',
    INVALID_SUPPLY_PRICE: '공급단가는 0 이상이어야 합니다.',
    INVALID_ORDER_DATE: '주문일 형식을 확인해 주세요.',
    INVALID_PRODUCT_NAME: '상품명을 입력해 주세요.',
    DRIVE_ACCESS_FAILED: 'Google Drive 폴더 접근에 실패했습니다. 폴더 ID와 권한을 확인해 주세요.',
    DRIVE_UPLOAD_FAILED: 'Google Drive 파일 저장에 실패했습니다. Apps Script 실행 계정의 폴더 권한을 확인해 주세요.',
    DAILY_SHEET_ACCESS_FAILED: '일일마감 시트 접근에 실패했습니다. 시트 ID와 공유 권한을 확인해 주세요.',
    DAILY_SHEET_APPEND_FAILED: '일일마감 시트에 테스트 행을 추가하지 못했습니다. 첫 번째 시트와 편집 권한을 확인해 주세요.',
    PRICE_RESOURCE_ACCESS_FAILED: '단가표 접근에 실패했습니다. PRICE_SHEET_ID와 공유 권한을 확인해 주세요.',
    HEALTH_HTTP_403: 'health check 호출이 거부되었습니다. Apps Script Web App 배포 권한을 확인해 주세요.',
    HEALTH_HTTP_404: 'Apps Script Web App URL을 찾을 수 없습니다. 최신 /exec URL인지 확인해 주세요.',
    HEALTH_HTTP_500: 'Apps Script health check가 서버 오류로 실패했습니다. 배포 버전과 로그를 확인해 주세요.',
    HEALTH_TIMEOUT: '자동화 상태 확인 시간이 초과되었습니다. Apps Script 응답 지연 또는 배포 문제를 확인해 주세요.',
    HEALTH_SCRIPT_LOAD_FAILED: 'Apps Script health check 스크립트를 불러오지 못했습니다. Web App URL과 배포 상태를 확인해 주세요.',
    UPLOAD_TIMEOUT: 'Apps Script 응답 시간이 초과되었습니다. Web App 재배포 상태와 Google 권한, 네트워크 상태를 확인해 주세요.',
  };

  if (code && messageByCode[code]) {
    return messageByCode[code];
  }

  if (messageByCode[baseMessage]) {
    return messageByCode[baseMessage];
  }

  if (baseMessage === 'Failed to fetch' || baseMessage.includes('NetworkError')) {
    return 'Apps Script health check 요청에 실패했습니다. 배포 URL과 네트워크 상태를 확인해 주세요.';
  }

  if (baseMessage.includes('aborted')) {
    return '자동화 상태 확인 시간이 초과되었습니다. Apps Script 응답 지연 또는 배포 문제를 확인해 주세요.';
  }

  return baseMessage;
}

fileInput.addEventListener('change', () => {
  resetStatus();
  const file = fileInput.files?.[0];
  if (!file) {
    fileName.textContent = '발주서 파일을 선택하세요';
    resultFileName.textContent = '-';
    uploadMessage.textContent = '파일을 선택한 뒤 업로드를 진행하세요.';
    return;
  }

  fileName.textContent = file.name;
  resultFileName.textContent = file.name;

  try {
    validateForm(file);
    setStatus(0, 'success', `${getExtension(file.name).toUpperCase()} / ${formatFileSize(file.size)}`);
    uploadMessage.textContent = '파일 형식과 기본 입력값이 확인되었습니다. 업로드를 진행할 수 있습니다.';
  } catch (error) {
    setStatus(0, 'error', '검증 실패');
    uploadMessage.textContent = formatUserError(error);
  }
});

validateButton.addEventListener('click', async () => {
  const configState = validateAutomationConfig();
  const file = fileInput.files?.[0];

  resetStatus();
  resultOutput.textContent = '처리 중입니다...';

  try {
    if (!configState.ok) {
      const configError = new Error(configState.message);
      configError.code = 'CONFIG_MISSING_APPS_SCRIPT_URL';
      throw configError;
    }

    if (!lastHealthResult) {
      throw new Error('먼저 자동화 연결 점검이 완료되어야 합니다. health check를 다시 확인해 주세요.');
    }

    if (!lastHealthResult.healthOk) {
      throw new Error('자동화 설정에 누락 또는 접근 실패가 있어 업로드를 진행할 수 없습니다.');
    }

    const { quantity, supplyPrice } = validateForm(file);
    markValidationSuccess(file);

    validateButton.disabled = true;
    validateButton.textContent = '처리 중...';

    setStatus(2, 'processing', 'Apps Script 요청 전송 중');
    uploadMessage.textContent = '파일을 읽고 브랜아크 Apps Script로 업로드하고 있습니다.';

    const fileBase64 = await readFileAsBase64(file);

    setStatus(2, 'success', '전송 완료');
    setStatus(3, 'processing', '중복 파일명 확인 중');
    setStatus(4, 'processing', 'Drive 저장 중');
    setStatus(5, 'processing', '시트 반영 중');

    const result = await submitToAppsScript(appsScriptWebAppUrl, {
      fileName: file.name,
      fileMimeType: file.type || 'application/octet-stream',
      fileBase64,
      orderDate: orderDateInput.value,
      productName: productNameInput.value.trim(),
      quantity,
      supplyPrice,
      allowDuplicateFile: allowDuplicateInput.checked,
    });

    setStatus(3, 'success', allowDuplicateInput.checked ? '중복 허용 처리' : '중복 없음');
    setStatus(4, 'success', 'Drive 저장 완료');
    setStatus(5, 'success', `테스트 행 ${result.appendedRow || '-'}번 추가`);
    setResult(result);
    uploadMessage.textContent = '업로드가 완료되었습니다. Drive 파일 생성과 일일마감 테스트 행 추가 결과를 확인해 주세요.';
    await runHealthCheck();
  } catch (error) {
    const message = formatUserError(error);
    uploadMessage.textContent = message;
    setError(error);

    const code = error?.code || '';
    if (code === 'DUPLICATE_FILE_NAME') {
      setStatus(3, 'error', '중복 파일명');
      setStatus(4, 'waiting', '저장 중단');
      setStatus(5, 'waiting', '반영 중단');
    } else if (code === 'DRIVE_UPLOAD_FAILED' || code === 'DRIVE_ACCESS_FAILED') {
      setStatus(4, 'error', 'Drive 실패');
      setStatus(5, 'waiting', '반영 중단');
    } else if (code === 'DAILY_SHEET_APPEND_FAILED' || code === 'DAILY_SHEET_ACCESS_FAILED') {
      setStatus(5, 'error', '시트 실패');
    } else if (code === 'UPLOAD_TIMEOUT') {
      setStatus(2, 'error', '응답 시간 초과');
    } else {
      const firstPendingIndex = statusItems.findIndex((item) => item.dataset.state === 'waiting' || item.dataset.state === 'processing');
      if (firstPendingIndex >= 0) {
        setStatus(firstPendingIndex, 'error', '실패');
      }
    }
  } finally {
    validateButton.disabled = !(lastHealthResult && lastHealthResult.healthOk);
    validateButton.textContent = '발주서 업로드 및 테스트 행 작성';
  }
});

setToday();
resetStatus();
runHealthCheck();
