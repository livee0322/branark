const fileInput = document.querySelector('#orderFile');
const fileName = document.querySelector('#fileName');
const validateButton = document.querySelector('#validateButton');
const uploadMessage = document.querySelector('#uploadMessage');
const allowDuplicateInput = document.querySelector('#allowDuplicateFile');
const statusItems = Array.from(document.querySelectorAll('#statusList li'));

const connectionPanel = document.querySelector('#connectionPanel');
const connectionStatus = document.querySelector('#connectionStatus');
const connectionDescription = document.querySelector('#connectionDescription');

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

const summaryFileName = document.querySelector('#summaryFileName');
const summaryMode = document.querySelector('#summaryMode');
const summarySourceSheets = document.querySelector('#summarySourceSheets');
const summarySourceRows = document.querySelector('#summarySourceRows');

const comparisonBox = document.querySelector('#comparisonBox');
const comparisonTitle = document.querySelector('#comparisonTitle');
const comparisonStatusBadge = document.querySelector('#comparisonStatusBadge');
const comparisonDescription = document.querySelector('#comparisonDescription');
const comparisonPrimary = document.querySelector('#comparisonPrimary');
const comparisonValidation = document.querySelector('#comparisonValidation');
const comparisonPrimaryTotal = document.querySelector('#comparisonPrimaryTotal');
const comparisonValidationTotal = document.querySelector('#comparisonValidationTotal');

const aggregateTableBody = document.querySelector('#aggregateTableBody');
const priceMatchTableBody = document.querySelector('#priceMatchTableBody');
const previewTableBody = document.querySelector('#previewTableBody');
const issuesPanel = document.querySelector('#issuesPanel');
const priceVerificationMessage = document.querySelector('#priceVerificationMessage');

const resultFileId = document.querySelector('#resultFileId');
const resultSheetName = document.querySelector('#resultSheetName');
const resultRowCount = document.querySelector('#resultRowCount');
const resultWarningCount = document.querySelector('#resultWarningCount');
const resultOutput = document.querySelector('#resultOutput');

const developerHealthOutput = document.querySelector('#developerHealthOutput');
const developerPayloadOutput = document.querySelector('#developerPayloadOutput');
const developerProcessOutput = document.querySelector('#developerProcessOutput');
const developerRawOutput = document.querySelector('#developerRawOutput');

const runtimeConfig = window.BRANARK_CLOSING_LEDGER_CONFIG || {};
const appsScriptWebAppUrl = String(runtimeConfig.appsScriptWebAppUrl || '').trim();
const maxFileSizeBytes = Number(runtimeConfig.maxFileSizeBytes || 8 * 1024 * 1024);
const healthTimeoutMs = Number(runtimeConfig.healthTimeoutMs || 15000);
const requestTimeoutMs = Number(runtimeConfig.requestTimeoutMs || 120000);
const allowedExtensions = ['csv', 'xlsx', 'xls'];

let lastHealthResult = null;
let lastPayloadSummary = null;
let developerState = {
  health: {},
  payload: {},
  process: {},
  raw: {},
};

function getExtension(name) {
  return name.includes('.') ? name.split('.').pop().toLowerCase() : '';
}

function formatNumber(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return '-';
  }
  return new Intl.NumberFormat('ko-KR').format(numberValue);
}

function formatCurrency(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return '-';
  }
  return `${new Intl.NumberFormat('ko-KR').format(numberValue)}원`;
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0MB';
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function formatDateTime(value) {
  return value ? String(value).replace('T', ' ') : '-';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function prettyJson(value) {
  return JSON.stringify(value ?? {}, null, 2);
}

function setConnectionState(state, title, description) {
  connectionPanel.dataset.state = state;
  connectionStatus.textContent = title;
  connectionDescription.textContent = description;
}

function setHealthCard(card, titleNode, descriptionNode, state, title, description) {
  card.dataset.state = state;
  titleNode.textContent = title;
  descriptionNode.textContent = description;
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

function resetComparison() {
  comparisonBox.dataset.state = 'idle';
  comparisonTitle.textContent = '수량 비교 대기';
  comparisonStatusBadge.textContent = '대기';
  comparisonDescription.textContent = '발주서 분석 후 운송장과 출고일지 수량 비교 결과를 표시합니다.';
  comparisonPrimary.textContent = '-';
  comparisonValidation.textContent = '-';
  comparisonPrimaryTotal.textContent = '-';
  comparisonValidationTotal.textContent = '-';
}

function resetResultSections() {
  summaryFileName.textContent = '-';
  summaryMode.textContent = '-';
  summarySourceSheets.textContent = '-';
  summarySourceRows.textContent = '-';
  resultFileId.textContent = '-';
  resultSheetName.textContent = '-';
  resultRowCount.textContent = '-';
  resultWarningCount.textContent = '-';
  resultOutput.textContent = '아직 실행 전입니다.';
  priceVerificationMessage.textContent = '공급단가표를 기준으로 금액을 확인한 뒤 결과를 보여줍니다.';

  aggregateTableBody.innerHTML = '<tr><td colspan="6">아직 분석 결과가 없습니다.</td></tr>';
  priceMatchTableBody.innerHTML = '<tr><td colspan="8">아직 단가 검증 결과가 없습니다.</td></tr>';
  previewTableBody.innerHTML = '<tr><td colspan="7">아직 반영 예정 행이 없습니다.</td></tr>';
  issuesPanel.innerHTML = '<p class="issue-empty">아직 오류나 확인 필요 항목이 없습니다.</p>';
  resetComparison();
}

function updateDeveloperLog({ health, payload, process, raw }) {
  if (health !== undefined) {
    developerState.health = health;
  }
  if (payload !== undefined) {
    developerState.payload = payload;
  }
  if (process !== undefined) {
    developerState.process = process;
  }
  if (raw !== undefined) {
    developerState.raw = raw;
  }

  developerHealthOutput.textContent = prettyJson(developerState.health || lastHealthResult || {});
  developerPayloadOutput.textContent = prettyJson(developerState.payload || lastPayloadSummary || {});
  developerProcessOutput.textContent = prettyJson(developerState.process || {});
  developerRawOutput.textContent = prettyJson(developerState.raw || {});
}

function validateAutomationConfig() {
  if (!appsScriptWebAppUrl) {
    setConnectionState('error', 'Apps Script URL 누락', 'web/closing-ledger/config.js에 Apps Script /exec URL이 필요합니다.');
    validateButton.disabled = true;
    return { ok: false, message: 'Apps Script URL이 설정되지 않았습니다.' };
  }

  if (!appsScriptWebAppUrl.startsWith('https://script.google.com/') || !appsScriptWebAppUrl.includes('/exec')) {
    setConnectionState('error', 'Apps Script URL 형식 오류', 'Apps Script Web App URL은 https://script.google.com/.../exec 형식이어야 합니다.');
    validateButton.disabled = true;
    return { ok: false, message: 'Apps Script Web App URL 형식이 올바르지 않습니다.' };
  }

  return { ok: true };
}

function validateFile(file) {
  if (!file) {
    throw new Error('파일을 먼저 선택해 주세요.');
  }

  const extension = getExtension(file.name);
  if (!allowedExtensions.includes(extension)) {
    throw new Error('지원하지 않는 파일 형식입니다. csv, xlsx, xls 파일만 업로드할 수 있습니다.');
  }

  if (file.size > maxFileSizeBytes) {
    throw new Error(`파일 용량은 8MB 이하여야 합니다. 현재 파일 용량은 ${formatFileSize(file.size)}입니다.`);
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      resolve(value.includes(',') ? value.split(',').pop() : value);
    };
    reader.onerror = () => reject(new Error('파일을 읽는 중 오류가 발생했습니다.'));
    reader.readAsDataURL(file);
  });
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

async function runHealthCheck() {
  const configState = validateAutomationConfig();
  if (!configState.ok) {
    uploadMessage.textContent = configState.message;
    updateDeveloperLog({ health: {}, process: {}, raw: { error: configState.message } });
    return;
  }

  setConnectionState('loading', '자동화 상태 확인 중', 'Apps Script health check를 실행하고 있습니다.');
  validateButton.disabled = true;

  setHealthCard(healthDriveCard, healthDriveTitle, healthDriveDescription, 'processing', '확인 중', '발주서 저장 폴더를 확인하고 있습니다.');
  setHealthCard(healthDailySheetCard, healthDailySheetTitle, healthDailySheetDescription, 'processing', '확인 중', '일일마감 시트 구조를 확인하고 있습니다.');
  setHealthCard(healthPriceCard, healthPriceTitle, healthPriceDescription, 'processing', '확인 중', '공급단가표 접근 상태를 확인하고 있습니다.');

  try {
    const result = await fetchHealthCheckJsonp(appsScriptWebAppUrl);
    if (!result || result.ok !== true) {
      throw mapAppsScriptError(result);
    }

    lastHealthResult = result;
    renderHealthResult(result);
    updateDeveloperLog({ health: result });

    const uploadReady = Boolean(result.healthOk);
    validateButton.disabled = !uploadReady;
    uploadMessage.textContent = uploadReady
      ? '자동화 연결이 확인되었습니다. 발주서 파일을 업로드해 자동 분석을 시작해 주세요.'
      : formatHealthBlockingMessage(result);
  } catch (error) {
    lastHealthResult = null;
    const message = formatUserError(error);
    setConnectionState('error', '자동화 연결 확인 실패', message);
    setHealthCard(healthDriveCard, healthDriveTitle, healthDriveDescription, 'error', '확인 실패', 'health check 응답을 받지 못했습니다.');
    setHealthCard(healthDailySheetCard, healthDailySheetTitle, healthDailySheetDescription, 'error', '확인 실패', 'health check 응답을 받지 못했습니다.');
    setHealthCard(healthPriceCard, healthPriceTitle, healthPriceDescription, 'error', '확인 실패', 'health check 응답을 받지 못했습니다.');
    validateButton.disabled = true;
    uploadMessage.textContent = message;
    updateDeveloperLog({ health: {}, raw: { code: error.code || '', message } });
  }
}

function formatHealthBlockingMessage(result) {
  const missing = result.missingProperties || [];
  const pageUpload = result.pageUpload || {};
  if (missing.length) {
    return `자동화 설정 누락: ${missing.join(', ')}`;
  }
  if (pageUpload.issueCode === 'PAGE_UPLOAD_DISABLED') {
    return '페이지 업로드 미허용 상태입니다. Apps Script Script Properties의 ALLOW_PAGE_UPLOAD=true 설정이 필요합니다.';
  }
  if (pageUpload.userMessage) {
    return pageUpload.userMessage;
  }
  return '자동화 연결 상태를 다시 확인해 주세요.';
}

function renderHealthResult(result) {
  const drive = result.drive || {};
  const dailySheet = result.dailySheet || {};
  const price = result.price || {};
  const pageUpload = result.pageUpload || {};

  healthCheckedAt.textContent = formatDateTime(result.checkedAt);
  healthAllowPageUpload.textContent = pageUpload.allowPageUpload ? '허용' : '미허용';
  healthAllowedOrigin.textContent = pageUpload.allowedPageOrigin || '-';
  healthApiToken.textContent = result.apiTokenConfigured ? '설정됨' : '미설정';

  if (result.healthOk) {
    setConnectionState('success', '자동화 연결 확인 완료', 'Drive, 일일마감 시트, 공급단가표, 페이지 업로드 설정이 모두 확인되었습니다.');
  } else if (pageUpload.issueCode === 'PAGE_UPLOAD_DISABLED') {
    setConnectionState('error', '페이지 업로드 미허용', formatHealthBlockingMessage(result));
  } else {
    setConnectionState('error', '자동화 설정 보완 필요', formatHealthBlockingMessage(result));
  }

  setHealthCard(
    healthDriveCard,
    healthDriveTitle,
    healthDriveDescription,
    drive.ok ? 'success' : 'error',
    drive.ok ? (drive.name || '접근 가능') : '접근 실패',
    drive.ok ? `발주서 저장 폴더에 접근했습니다. 폴더 ID: ${drive.id || '-'}` : formatResourceIssue(drive),
  );

  setHealthCard(
    healthDailySheetCard,
    healthDailySheetTitle,
    healthDailySheetDescription,
    dailySheet.ok ? 'success' : 'error',
    dailySheet.ok ? (dailySheet.spreadsheetTitle || '접근 가능') : '접근 실패',
    dailySheet.ok
      ? `${dailySheet.sheetName || '첫 번째 시트'} / 헤더 ${dailySheet.headerOk ? '확인 완료' : '확인 필요'}`
      : formatResourceIssue(dailySheet),
  );

  setHealthCard(
    healthPriceCard,
    healthPriceTitle,
    healthPriceDescription,
    price.ok ? 'success' : 'error',
    price.ok ? (price.name || '접근 가능') : '접근 실패',
    price.ok
      ? `단가표 ID: ${price.id || '-'} / ${price.previewMessage || '미리보기를 확인했습니다.'}`
      : formatResourceIssue(price),
  );
}

function formatResourceIssue(resource) {
  return resource?.userMessage || resource?.errorCode || '상세 오류 정보를 확인하지 못했습니다.';
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
    let iframeLoaded = false;
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
          uploadMessage.textContent = 'Apps Script 화면은 열렸지만 응답 메시지를 받지 못했습니다. Web App 재배포 상태와 postMessage 응답을 확인해 주세요.';
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

function mapAppsScriptError(payload) {
  const error = new Error(payload?.userMessage || payload?.error || payload?.message || 'Apps Script 처리 중 오류가 발생했습니다.');
  error.code = payload?.errorCode || payload?.code || '';
  error.userMessage = payload?.userMessage || '';
  error.details = payload?.details || '';
  error.errors = payload?.errors || [];
  error.payload = payload;
  return error;
}

function formatUserError(error) {
  const code = error?.code || '';
  const messageByCode = {
    INVALID_API_TOKEN: '요청 인증에 실패했습니다. GitHub Actions API_TOKEN 또는 페이지 업로드 허용 설정을 확인해 주세요.',
    INVALID_PAGE_ORIGIN: '이 페이지 Origin은 업로드가 허용되지 않았습니다. ALLOWED_PAGE_ORIGIN 설정을 확인해 주세요.',
    PAGE_UPLOAD_DISABLED: '페이지 업로드가 허용되지 않았습니다. ALLOW_PAGE_UPLOAD=true 설정이 필요합니다.',
    PAGE_UPLOAD_ORIGIN_MISMATCH: '페이지 업로드 허용 Origin이 브랜아크 GitHub Pages 주소와 다릅니다.',
    DUPLICATE_FILE_NAME: '같은 파일명이 이미 Google Drive 폴더에 있습니다. 파일명을 바꾸거나 중복 허용 옵션을 켜 주세요.',
    UNSUPPORTED_FILE_TYPE: '지원하지 않는 파일 형식입니다. csv, xlsx, xls 파일만 업로드할 수 있습니다.',
    SOURCE_SHEET_NOT_FOUND: '발주서에서 운송장 또는 출고일지 후보 시트를 찾지 못했습니다.',
    SOURCE_HEADER_NOT_FOUND: '상품명 또는 수량 헤더를 찾지 못했습니다.',
    PRODUCT_NAME_NOT_FOUND: '상품명 값을 읽지 못한 행이 있습니다.',
    INVALID_QUANTITY: '수량이 비어 있거나 숫자가 아닌 행이 있습니다.',
    PRICE_NOT_FOUND: '단가표에서 찾지 못한 상품이 있어 일일마감 반영을 중단했습니다.',
    PRICE_HEADER_NOT_FOUND: '단가표에서 상품명 또는 공급단가 헤더를 찾지 못했습니다.',
    FILE_CONVERSION_FAILED: '엑셀 파일을 Google Sheet로 변환하지 못했습니다.',
    FILE_CONVERSION_UNAVAILABLE: 'Drive API 고급 서비스가 활성화되지 않아 엑셀 파일을 변환할 수 없습니다.',
    DAILY_SHEET_ACCESS_FAILED: '일일마감 시트에 접근하지 못했습니다. 시트 ID와 공유 권한을 확인해 주세요.',
    DAILY_SHEET_HEADER_MISSING: '일일마감 시트 헤더를 찾지 못했습니다.',
    DAILY_SHEET_APPEND_FAILED: '일일마감 시트에 결과 행을 추가하지 못했습니다.',
    AUTO_CLOSING_LEDGER_BLOCKED: '검증 오류가 있어 일일마감 반영을 중단했습니다.',
    QUANTITY_COMPARISON_MISMATCH: '운송장 기준 수량과 출고일지 합계가 달라 반영을 중단했습니다.',
    NO_APPEND_ROWS: '반영할 결과 행이 0건입니다.',
    MISSING_FILE_CONTENT: '업로드 파일 내용이 비어 있습니다.',
    UPLOAD_TIMEOUT: 'Apps Script 응답 시간이 초과되었습니다. Web App 재배포 상태와 postMessage 응답을 확인해 주세요.',
    HEALTH_TIMEOUT: 'health check 응답 시간이 초과되었습니다. Apps Script 배포 상태를 확인해 주세요.',
    HEALTH_SCRIPT_LOAD_FAILED: 'health check 스크립트를 불러오지 못했습니다. Web App URL을 확인해 주세요.',
  };

  return messageByCode[code] || error?.userMessage || error?.message || String(error);
}

function setSummary(result) {
  summaryFileName.textContent = result.uploadedFile?.fileName || '-';
  summaryMode.textContent = result.mode || '-';
  summarySourceSheets.textContent = (result.parsed?.sourceSheetNames || []).join(', ') || '-';
  summarySourceRows.textContent = result.parsed?.sourceRowCount ?? '-';
}

function renderComparison(comparison) {
  if (!comparison) {
    resetComparison();
    return;
  }

  comparisonPrimary.textContent = comparison.primarySheet || '-';
  comparisonValidation.textContent = (comparison.validationSheets || []).join(', ') || '비교 대상 없음';
  comparisonPrimaryTotal.textContent = formatNumber(comparison.primaryQuantityTotal);
  comparisonValidationTotal.textContent = comparison.comparisonPerformed ? formatNumber(comparison.validationQuantityTotal) : '비교 대상 없음';

  if (!comparison.comparisonPerformed) {
    comparisonBox.dataset.state = 'idle';
    comparisonTitle.textContent = '비교 대상 시트 없음';
    comparisonStatusBadge.textContent = '안내';
    comparisonDescription.textContent = '운송장만 있거나 비교 대상 시트가 없어 기준 시트만 사용했습니다.';
    return;
  }

  if (comparison.quantityMatched) {
    comparisonBox.dataset.state = 'success';
    comparisonTitle.textContent = '수량 비교 일치';
    comparisonStatusBadge.textContent = '정상';
    comparisonDescription.textContent = '운송장 기준 수량과 출고일지 합산 수량이 일치합니다.';
    return;
  }

  comparisonBox.dataset.state = 'error';
  comparisonTitle.textContent = '수량 비교 불일치';
  comparisonStatusBadge.textContent = '차단';
  comparisonDescription.textContent = '운송장 기준 수량과 출고일지 합산 수량이 다릅니다. 차이 항목을 확인한 뒤 다시 진행해 주세요.';
}

function renderAggregateTable(items) {
  if (!items?.length) {
    aggregateTableBody.innerHTML = '<tr><td colspan="6">아직 분석 결과가 없습니다.</td></tr>';
    return;
  }

  aggregateTableBody.innerHTML = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.orderDate || '-')}</td>
      <td>${escapeHtml((item.rawProductNames || []).join(', ') || item.productName || '-')}</td>
      <td>${escapeHtml(item.normalizedProductName || '-')}</td>
      <td>${escapeHtml((item.optionNames || []).join(', ') || item.spec || '-')}</td>
      <td>${escapeHtml(formatNumber(item.quantity))}</td>
      <td>${escapeHtml((item.sourceSheetNames || []).join(', ') || '-')}</td>
    </tr>
  `).join('');
}

function renderPriceMatchTable(matches) {
  if (!matches?.length) {
    priceMatchTableBody.innerHTML = '<tr><td colspan="8">아직 단가 검증 결과가 없습니다.</td></tr>';
    priceVerificationMessage.textContent = '공급단가표를 기준으로 금액을 확인한 뒤 결과를 보여줍니다.';
    return;
  }

  const unmatchedCount = matches.filter((item) => !item.matched).length;
  priceVerificationMessage.textContent = unmatchedCount > 0
    ? '단가표에서 찾지 못한 상품이 있습니다. 상품명 또는 규격을 확인한 뒤 다시 진행해 주세요.'
    : '공급단가표를 기준으로 금액을 확인했습니다.';

  priceMatchTableBody.innerHTML = matches.map((item) => `
    <tr>
      <td>${escapeHtml(item.orderProductName || '-')}</td>
      <td>${escapeHtml(item.priceProductName || '-')}</td>
      <td>${escapeHtml(item.priceSpec || '-')}</td>
      <td>${escapeHtml(formatCurrency(item.supplyPrice))}</td>
      <td>${escapeHtml(formatCurrency(item.vat))}</td>
      <td>${escapeHtml(formatNumber(item.quantity))}</td>
      <td>${escapeHtml(formatCurrency(item.totalPrice))}</td>
      <td>${escapeHtml(item.status || (item.matched ? '정상 매칭' : '확인 필요'))}</td>
    </tr>
  `).join('');
}

function renderPreviewTable(rows) {
  if (!rows?.length) {
    previewTableBody.innerHTML = '<tr><td colspan="7">아직 반영 예정 행이 없습니다.</td></tr>';
    return;
  }

  previewTableBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.orderDate || '-')}</td>
      <td>${escapeHtml(row.productName || '-')}</td>
      <td>${escapeHtml(row.normalizedProductName || '-')}</td>
      <td>${escapeHtml(formatNumber(row.quantity))}</td>
      <td>${escapeHtml(formatCurrency(row.supplyPrice))}</td>
      <td>${escapeHtml(formatCurrency(row.totalPrice))}</td>
      <td>${escapeHtml(row.memo || '-')}</td>
    </tr>
  `).join('');
}

function renderIssues(warnings, errors) {
  const warningList = warnings || [];
  const errorList = errors || [];
  const items = [];

  errorList.forEach((item) => {
    items.push(`<div class="issue-card issue-error"><strong>오류</strong><p>${escapeHtml(item.message || item.code || '오류가 발생했습니다.')}</p></div>`);
  });

  warningList.forEach((item) => {
    items.push(`<div class="issue-card issue-warning"><strong>확인 필요</strong><p>${escapeHtml(item.message || item.code || '확인이 필요합니다.')}</p></div>`);
  });

  issuesPanel.innerHTML = items.length ? items.join('') : '<p class="issue-empty">오류와 경고 없이 처리했습니다.</p>';
}

function renderFinalResult(result) {
  resultFileId.textContent = result.uploadedFile?.fileId || '-';
  resultSheetName.textContent = [result.appended?.spreadsheetTitle, result.appended?.sheetName].filter(Boolean).join(' / ') || '-';
  resultRowCount.textContent = result.appended?.rowCount ?? 0;
  resultWarningCount.textContent = (result.warnings || []).length;
  resultOutput.textContent = prettyJson({
    uploadedFile: result.uploadedFile,
    parsed: result.parsed,
    comparison: result.comparison,
    matched: result.matched,
    appended: result.appended,
    warnings: result.warnings,
    errors: result.errors,
  });
}

function applySuccessStatuses(result) {
  setStatus(0, 'success', '검증 완료');
  setStatus(1, 'success', '전송 완료');
  setStatus(2, 'success', `${result.parsed?.sourceSheetNames?.length || 0}개 시트 분석`);
  setStatus(3, 'success', result.comparison?.quantityMatched === false ? '검증 차단' : `${result.matched?.matchedCount || 0}건 매칭`);
  setStatus(4, 'success', `${result.rows?.length || 0}행 구성`);
  setStatus(5, 'success', `${result.appended?.rowCount || 0}행 반영`);
}

function applyFailureStatus(error) {
  const code = error?.code || '';
  setStatus(0, 'success', '파일 확인 완료');
  setStatus(1, 'success', '전송 완료');

  if (['SOURCE_SHEET_NOT_FOUND', 'SOURCE_HEADER_NOT_FOUND', 'FILE_CONVERSION_FAILED', 'FILE_CONVERSION_UNAVAILABLE'].includes(code)) {
    setStatus(2, 'error', '파일 분석 실패');
    return;
  }

  if (['PRICE_NOT_FOUND', 'PRICE_HEADER_NOT_FOUND', 'PRICE_RESOURCE_ACCESS_FAILED', 'QUANTITY_COMPARISON_MISMATCH'].includes(code)) {
    setStatus(2, 'success', '파일 분석 완료');
    setStatus(3, 'error', '검증 실패');
    return;
  }

  if (['DAILY_SHEET_ACCESS_FAILED', 'DAILY_SHEET_HEADER_MISSING', 'DAILY_SHEET_APPEND_FAILED', 'AUTO_CLOSING_LEDGER_BLOCKED'].includes(code)) {
    setStatus(2, 'success', '파일 분석 완료');
    setStatus(3, 'success', '검증 완료');
    setStatus(4, 'error', '반영 차단');
    return;
  }

  if (code === 'UPLOAD_TIMEOUT') {
    setStatus(1, 'error', '응답 시간 초과');
    return;
  }

  const pendingIndex = statusItems.findIndex((item) => item.dataset.state === 'waiting' || item.dataset.state === 'processing');
  if (pendingIndex >= 0) {
    setStatus(pendingIndex, 'error', '실패');
  }
}

fileInput.addEventListener('change', () => {
  resetStatus();
  resetResultSections();

  const file = fileInput.files?.[0];
  if (!file) {
    fileName.textContent = '발주서 파일을 선택해 주세요';
    uploadMessage.textContent = '파일을 선택한 뒤 업로드를 진행해 주세요.';
    return;
  }

  try {
    validateFile(file);
    fileName.textContent = `${file.name} (${getExtension(file.name).toUpperCase()} / ${formatFileSize(file.size)})`;
    setStatus(0, 'success', '업로드 준비 완료');
    uploadMessage.textContent = '파일 검증이 완료되었습니다. 자동 분석을 시작할 수 있습니다.';
  } catch (error) {
    fileName.textContent = file.name;
    setStatus(0, 'error', '파일 검증 실패');
    uploadMessage.textContent = formatUserError(error);
  }
});

validateButton.addEventListener('click', async () => {
  const file = fileInput.files?.[0];
  const configState = validateAutomationConfig();

  resetStatus();
  resetResultSections();
  resultOutput.textContent = '처리 중입니다...';

  try {
    if (!configState.ok) {
      throw new Error(configState.message);
    }
    if (!lastHealthResult?.healthOk) {
      throw new Error('자동화 연결 상태가 완료되지 않았습니다. health check 결과를 먼저 확인해 주세요.');
    }

    validateFile(file);
    setStatus(0, 'success', '업로드 조건 확인 완료');
    setStatus(1, 'processing', 'Apps Script 요청 전송 중');

    validateButton.disabled = true;
    validateButton.textContent = '처리 중...';
    uploadMessage.textContent = '발주서 파일을 업로드하고 자동 분석을 시작합니다.';

    const fileBase64 = await readFileAsBase64(file);
    const payload = {
      fileName: file.name,
      fileMimeType: file.type || 'application/octet-stream',
      fileBase64,
      allowDuplicateFile: allowDuplicateInput.checked,
    };
    lastPayloadSummary = {
      fileName: file.name,
      fileMimeType: file.type || 'application/octet-stream',
      fileSize: file.size,
      allowDuplicateFile: allowDuplicateInput.checked,
      mode: 'auto-closing-ledger',
    };

    updateDeveloperLog({ payload: lastPayloadSummary, process: {}, raw: {} });

    const result = await submitToAppsScript(appsScriptWebAppUrl, payload);

    setSummary(result);
    renderComparison(result.comparison);
    renderAggregateTable(result.aggregatedItems);
    renderPriceMatchTable(result.priceMatches);
    renderPreviewTable(result.rows);
    renderIssues(result.warnings, result.errors);
    renderFinalResult(result);
    applySuccessStatuses(result);
    updateDeveloperLog({
      payload: lastPayloadSummary,
      process: result.debug || {},
      raw: result,
    });

    uploadMessage.textContent = '발주서 분석과 일일마감 반영이 완료되었습니다.';
    await runHealthCheck();
  } catch (error) {
    const message = formatUserError(error);
    uploadMessage.textContent = message;
    renderIssues([], error.errors || []);
    resultOutput.textContent = prettyJson({
      code: error.code || '',
      message,
      details: error.details || error.message || String(error),
      errors: error.errors || [],
    });
    applyFailureStatus(error);
    updateDeveloperLog({
      payload: lastPayloadSummary,
      process: error.payload || {},
      raw: {
        code: error.code || '',
        message,
        details: error.details || '',
        errors: error.errors || [],
      },
    });
  } finally {
    validateButton.disabled = !(lastHealthResult && lastHealthResult.healthOk);
    validateButton.textContent = '발주서 업로드 및 자동 분석 시작';
  }
});

resetStatus();
resetResultSections();
updateDeveloperLog({ health: {}, payload: {}, process: {}, raw: {} });
runHealthCheck();
