/**
 * 브랜아크 일일마감 자동화용 Google Apps Script Web App
 *
 * 현재 페이지 기능 범위
 * - 발주서 파일을 Google Drive 폴더에 저장
 * - 화면 입력값으로 일일마감 첫 번째 시트에 테스트 행 1건 추가
 *
 * Script Properties
 * - API_TOKEN
 * - DRIVE_FOLDER_ID
 * - DAILY_SHEET_ID
 * - PRICE_SHEET_ID
 * - ALLOW_PAGE_UPLOAD=true
 * - ALLOWED_PAGE_ORIGIN=https://livee0322.github.io
 */
function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};

  try {
    if (params.action === 'health') {
      return jsonOutput_(runHealthCheck_(), params.callback);
    }

    if (params.action === 'process') {
      var props = PropertiesService.getScriptProperties();
      var processResult = handlePayload_(params, props);
      processResult.ok = true;
      return jsonOutput_(processResult, params.callback);
    }

    return jsonOutput_({
      ok: true,
      service: 'branark-closing-ledger-webapp',
      message: '브랜아크 일일마감 Apps Script Web App is running.',
    }, params.callback);
  } catch (error) {
    return jsonOutput_(buildErrorResponse_(error), params.callback);
  }
}

function doPost(e) {
  var payload = {};

  try {
    payload = parsePayload_(e);
    var props = PropertiesService.getScriptProperties();
    var result = handlePayload_(payload, props);
    result.ok = true;

    if (payload.responseMode === 'postMessage') {
      return postMessageOutput_(result, payload.callbackId, payload.pageOrigin);
    }

    return jsonOutput_(result);
  } catch (error) {
    var response = buildErrorResponse_(error);
    response.callbackId = payload.callbackId || '';

    if (payload.responseMode === 'postMessage') {
      return postMessageOutput_(response, payload.callbackId, payload.pageOrigin);
    }

    return jsonOutput_(response);
  }
}

function runHealthCheck_() {
  var props = PropertiesService.getScriptProperties();
  var checkedAt = Utilities.formatDate(new Date(), 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ss");
  var missingProperties = [];

  var apiToken = String(props.getProperty('API_TOKEN') || '').trim();
  var driveFolderId = String(props.getProperty('DRIVE_FOLDER_ID') || '').trim();
  var dailySheetId = String(props.getProperty('DAILY_SHEET_ID') || '').trim();
  var priceSheetId = String(props.getProperty('PRICE_SHEET_ID') || '').trim();
  var allowPageUpload = String(props.getProperty('ALLOW_PAGE_UPLOAD') || '').toLowerCase() === 'true';
  var expectedPageOrigin = 'https://livee0322.github.io';
  var allowedPageOrigin = String(props.getProperty('ALLOWED_PAGE_ORIGIN') || expectedPageOrigin).trim();
  var pageUploadOk = allowPageUpload && allowedPageOrigin === expectedPageOrigin;
  var pageUploadIssueCode = '';
  var pageUploadUserMessage = '';

  if (!allowPageUpload) {
    pageUploadIssueCode = 'PAGE_UPLOAD_DISABLED';
    pageUploadUserMessage = '페이지 업로드가 허용되지 않았습니다. ALLOW_PAGE_UPLOAD=true 설정이 필요합니다.';
  } else if (allowedPageOrigin !== expectedPageOrigin) {
    pageUploadIssueCode = 'PAGE_UPLOAD_ORIGIN_MISMATCH';
    pageUploadUserMessage = '페이지 업로드 허용 Origin이 브랜아크 GitHub Pages 주소와 다릅니다.';
  }

  if (!apiToken) {
    missingProperties.push('API_TOKEN');
  }
  if (!driveFolderId) {
    missingProperties.push('DRIVE_FOLDER_ID');
  }
  if (!dailySheetId) {
    missingProperties.push('DAILY_SHEET_ID');
  }
  if (!priceSheetId) {
    missingProperties.push('PRICE_SHEET_ID');
  }

  var driveStatus = inspectDriveFolder_(driveFolderId);
  var dailySheetStatus = inspectDailySheet_(dailySheetId);
  var priceStatus = inspectPriceResource_(priceSheetId);

  return {
    ok: true,
    service: 'branark-closing-ledger-webapp',
    checkedAt: checkedAt,
    scope: '발주서 파일 저장 + 테스트 행 작성',
    apiTokenConfigured: Boolean(apiToken),
    missingProperties: missingProperties,
    pageUpload: {
      ok: pageUploadOk,
      allowPageUpload: allowPageUpload,
      allowedPageOrigin: allowedPageOrigin,
      expectedPageOrigin: expectedPageOrigin,
      issueCode: pageUploadIssueCode,
      userMessage: pageUploadUserMessage,
    },
    drive: driveStatus,
    dailySheet: dailySheetStatus,
    price: priceStatus,
    healthOk: missingProperties.length === 0 && pageUploadOk && driveStatus.ok && dailySheetStatus.ok && priceStatus.ok,
  };
}

function inspectDriveFolder_(driveFolderId) {
  if (!driveFolderId) {
    return resourceError_('MISSING_DRIVE_FOLDER_ID', 'DRIVE_FOLDER_ID 설정이 누락되었습니다.');
  }

  try {
    var folder = DriveApp.getFolderById(driveFolderId);
    return {
      ok: true,
      id: folder.getId(),
      name: folder.getName(),
    };
  } catch (error) {
    return resourceError_('DRIVE_ACCESS_FAILED', 'Google Drive 발주서 폴더에 접근하지 못했습니다.', error);
  }
}

function inspectDailySheet_(dailySheetId) {
  if (!dailySheetId) {
    return resourceError_('MISSING_DAILY_SHEET_ID', 'DAILY_SHEET_ID 설정이 누락되었습니다.');
  }

  try {
    var spreadsheet = SpreadsheetApp.openById(dailySheetId);
    var sheet = spreadsheet.getSheets()[0];
    return {
      ok: true,
      id: spreadsheet.getId(),
      spreadsheetTitle: spreadsheet.getName(),
      sheetName: sheet ? sheet.getName() : '',
      lastRow: sheet ? sheet.getLastRow() : 0,
    };
  } catch (error) {
    return resourceError_('DAILY_SHEET_ACCESS_FAILED', '일일마감 시트에 접근하지 못했습니다.', error);
  }
}

function inspectPriceResource_(priceSheetId) {
  if (!priceSheetId) {
    return resourceError_('MISSING_PRICE_SHEET_ID', 'PRICE_SHEET_ID 설정이 누락되었습니다.');
  }

  try {
    var spreadsheet = SpreadsheetApp.openById(priceSheetId);
    var sheet = spreadsheet.getSheets()[0];
    var previewRows = [];

    if (sheet) {
      var lastRow = Math.min(sheet.getLastRow(), 6);
      if (lastRow > 0) {
        var values = sheet.getRange(1, 1, lastRow, 2).getDisplayValues();
        for (var i = 0; i < values.length; i += 1) {
          if (i === 0 && isHeaderRow_(values[i])) {
            continue;
          }
          if (String(values[i][0] || '').trim()) {
            previewRows.push([values[i][0], values[i][1]]);
          }
        }
      }
    }

    return {
      ok: true,
      id: spreadsheet.getId(),
      name: spreadsheet.getName(),
      type: 'spreadsheet',
      sheetName: sheet ? sheet.getName() : '',
      previewAvailable: previewRows.length > 0,
      previewRows: previewRows,
      previewMessage: previewRows.length > 0
        ? '단가표 상위 일부 행을 검토용으로 표시합니다.'
        : '단가표 시트에 접근했지만 검토용 행을 읽지 못했습니다.',
    };
  } catch (spreadsheetError) {
    try {
      var file = DriveApp.getFileById(priceSheetId);
      return {
        ok: true,
        id: file.getId(),
        name: file.getName(),
        type: 'file',
        previewAvailable: false,
        previewRows: [],
        previewMessage: '단가표 파일에는 접근했지만 Google Sheet 형식이 아니라 화면 미리보기를 제공하지 않습니다.',
      };
    } catch (fileError) {
      return resourceError_('PRICE_RESOURCE_ACCESS_FAILED', '단가표 파일 또는 시트에 접근하지 못했습니다.', fileError);
    }
  }
}

function isHeaderRow_(row) {
  var first = String(row[0] || '').trim();
  var second = String(row[1] || '').trim();
  return first === '상품명' || second === '공급단가';
}

function handlePayload_(payload, props) {
  var expectedToken = String(props.getProperty('API_TOKEN') || '').trim();
  var allowPageUpload = String(props.getProperty('ALLOW_PAGE_UPLOAD') || '').toLowerCase() === 'true';
  var allowedPageOrigin = String(props.getProperty('ALLOWED_PAGE_ORIGIN') || 'https://livee0322.github.io').trim();
  var isPageUpload = payload.source === 'branark-index-html';

  if (payload.apiToken && expectedToken && payload.apiToken === expectedToken) {
    return runClosingLedgerProcess_(payload, props);
  }

  if (isPageUpload && allowPageUpload) {
    if (allowedPageOrigin && payload.pageOrigin !== allowedPageOrigin) {
      throw appError_('INVALID_PAGE_ORIGIN', '이 페이지 Origin은 업로드가 허용되지 않았습니다.', 'ALLOWED_PAGE_ORIGIN=' + allowedPageOrigin + ', pageOrigin=' + payload.pageOrigin);
    }
    return runClosingLedgerProcess_(payload, props);
  }

  if (!expectedToken) {
    throw appError_('MISSING_API_TOKEN', 'API_TOKEN 설정이 누락되었습니다. GitHub Actions 연동에는 계속 필요합니다.');
  }

  throw appError_('INVALID_API_TOKEN', '요청 인증에 실패했습니다.');
}

function runClosingLedgerProcess_(payload, props) {
  var driveFolderId = requireValue_(props.getProperty('DRIVE_FOLDER_ID'), 'DRIVE_FOLDER_ID');
  var dailySheetId = requireValue_(props.getProperty('DAILY_SHEET_ID'), 'DAILY_SHEET_ID');
  var priceSheetId = requireValue_(props.getProperty('PRICE_SHEET_ID'), 'PRICE_SHEET_ID');

  var fileName = String(
    payload.fileName ||
    payload.testFileName ||
    payload.test_file_name ||
    ''
  ).trim();
  var fileMimeType = String(payload.fileMimeType || 'application/octet-stream');
  var fileBase64 = String(payload.fileBase64 || '').trim();
  var orderDate = String(payload.orderDate || '').trim();
  var productName = String(payload.productName || '').trim();
  var quantity = Number(payload.quantity);
  var supplyPrice = Number(payload.supplyPrice);
  var allowDuplicateFile = String(payload.allowDuplicateFile || '').toLowerCase() === 'true';
  var totalPrice = quantity * supplyPrice;
  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');

  if (!fileName) {
    throw appError_('INVALID_FILE_NAME', '파일명이 비어 있습니다.');
  }
  if (!orderDate || !/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) {
    throw appError_('INVALID_ORDER_DATE', '주문일 형식을 확인해 주세요.');
  }
  if (!productName) {
    throw appError_('INVALID_PRODUCT_NAME', '상품명을 입력해 주세요.');
  }
  if (!isFinite(quantity) || quantity < 1) {
    throw appError_('INVALID_QUANTITY', '수량은 1 이상이어야 합니다.');
  }
  if (!isFinite(supplyPrice) || supplyPrice < 0) {
    throw appError_('INVALID_SUPPLY_PRICE', '공급단가는 0 이상이어야 합니다.');
  }

  var folder;
  try {
    folder = DriveApp.getFolderById(driveFolderId);
  } catch (error) {
    throw appError_('DRIVE_ACCESS_FAILED', 'Google Drive 발주서 폴더에 접근하지 못했습니다.', error.message);
  }

  var duplicateFiles = folder.getFilesByName(fileName);
  if (duplicateFiles.hasNext() && !allowDuplicateFile) {
    throw appError_('DUPLICATE_FILE_NAME', '같은 파일명이 이미 Google Drive 폴더에 있습니다.');
  }

  var createdFile;
  try {
    var bytes = Utilities.base64Decode(fileBase64);
    var blob = Utilities.newBlob(bytes, fileMimeType, fileName);
    createdFile = folder.createFile(blob);
  } catch (error) {
    throw appError_('DRIVE_UPLOAD_FAILED', 'Google Drive에 파일을 저장하지 못했습니다.', error.message);
  }

  var priceResource = inspectPriceResource_(priceSheetId);
  if (!priceResource.ok) {
    throw appError_(priceResource.errorCode, priceResource.userMessage, priceResource.details);
  }

  var spreadsheet;
  var sheet;
  try {
    spreadsheet = SpreadsheetApp.openById(dailySheetId);
    sheet = spreadsheet.getSheets()[0];
  } catch (error) {
    throw appError_('DAILY_SHEET_ACCESS_FAILED', '일일마감 시트에 접근하지 못했습니다.', error.message);
  }

  try {
    var memo = '[TEST] 파일 저장 + 테스트 행 작성 / Drive file ID: ' + createdFile.getId() + ' / 저장 시각: ' + now;
    sheet.appendRow([orderDate, productName, quantity, supplyPrice, totalPrice, memo]);
  } catch (error) {
    throw appError_('DAILY_SHEET_APPEND_FAILED', '일일마감 시트에 테스트 행을 추가하지 못했습니다.', error.message);
  }

  return {
    callbackId: payload.callbackId || '',
    scope: '발주서 파일 저장 + 테스트 행 작성',
    driveFolderId: driveFolderId,
    driveFolderName: folder.getName(),
    fileId: createdFile.getId(),
    fileName: createdFile.getName(),
    fileUrl: createdFile.getUrl(),
    priceFileId: priceResource.id || priceSheetId,
    priceFileName: priceResource.name || '',
    dailySheetId: dailySheetId,
    spreadsheetTitle: spreadsheet.getName(),
    sheetName: sheet.getName(),
    appendedRow: sheet.getLastRow(),
  };
}

function parsePayload_(e) {
  if (!e) {
    throw appError_('EMPTY_REQUEST', '요청 정보가 비어 있습니다.');
  }

  if (e.postData && e.postData.contents && String(e.postData.type || '').indexOf('application/json') >= 0) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (error) {
      throw appError_('INVALID_JSON', '요청 JSON을 읽지 못했습니다.', error.message);
    }
  }

  if (e.parameter && Object.keys(e.parameter).length > 0) {
    return e.parameter;
  }

  if (e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (ignore) {}
  }

  throw appError_('EMPTY_POST_BODY', 'POST 요청 본문이 비어 있습니다.');
}

function requireValue_(value, name) {
  var normalized = String(value || '').trim();
  if (!normalized) {
    throw appError_('MISSING_' + name, name + ' 설정이 누락되었습니다.');
  }
  return normalized;
}

function resourceError_(code, userMessage, error) {
  return {
    ok: false,
    errorCode: code,
    userMessage: userMessage,
    details: error && error.message ? error.message : String(error || ''),
  };
}

function appError_(code, userMessage, details) {
  var error = new Error(details || userMessage);
  error.code = code;
  error.userMessage = userMessage;
  error.details = details || '';
  return error;
}

function buildErrorResponse_(error) {
  return {
    ok: false,
    errorCode: error && error.code ? error.code : '',
    userMessage: error && error.userMessage ? error.userMessage : (error && error.message ? error.message : String(error)),
    error: error && error.message ? error.message : String(error),
    details: error && error.details ? error.details : '',
    stack: error && error.stack ? error.stack : '',
  };
}

function jsonOutput_(object, callbackName) {
  if (callbackName) {
    var callback = sanitizeCallbackName_(callbackName);
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(object) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}

function postMessageOutput_(object, callbackId, pageOrigin) {
  object.callbackId = callbackId || object.callbackId || '';
  var json = JSON.stringify(object).replace(/</g, '\\u003c');
  var targetOrigin = sanitizeTargetOrigin_(pageOrigin);
  var html = '<!doctype html><html><body><script>' +
    'window.top.postMessage(' + json + ', ' + JSON.stringify(targetOrigin) + ');' +
    '</script></body></html>';
  return HtmlService.createHtmlOutput(html);
}

function sanitizeCallbackName_(name) {
  var callback = String(name || '').trim();
  if (!/^[A-Za-z_$][0-9A-Za-z_$]*(\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callback)) {
    throw appError_('INVALID_CALLBACK', 'callback 이름이 올바르지 않습니다.');
  }
  return callback;
}

function sanitizeTargetOrigin_(pageOrigin) {
  var origin = String(pageOrigin || '').trim();
  if (/^https?:\/\/[A-Za-z0-9._:-]+$/.test(origin)) {
    return origin;
  }
  return '*';
}
