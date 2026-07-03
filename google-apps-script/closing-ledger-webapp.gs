/**
 * 브랜아크 일일마감 자동화용 Google Apps Script Web App
 *
 * 실행 주체: 배포한 Google 계정
 * 용도:
 * - 개인 Google Drive 폴더에 발주서 파일 생성
 * - 일일 마감 Google Sheet에 테스트 행 추가
 * - GitHub Actions 또는 GitHub Pages index.html에서 호출
 *
 * Script Properties에 아래 값을 설정해야 합니다.
 * - API_TOKEN
 * - DRIVE_FOLDER_ID
 * - DAILY_SHEET_ID
 * - PRICE_SHEET_ID
 *
 * index.html에서 URL/Token 입력 없이 사용하려면 아래 값도 설정합니다.
 * - ALLOW_PAGE_UPLOAD=true
 * - ALLOWED_PAGE_ORIGIN=https://livee0322.github.io
 */
function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};

  if (params.action === 'process') {
    try {
      var props = PropertiesService.getScriptProperties();
      var result = handlePayload_(params, props);
      result.ok = true;
      return jsonOutput_(result, params.callback);
    } catch (error) {
      return jsonOutput_({
        ok: false,
        error: error && error.message ? error.message : String(error),
        stack: error && error.stack ? error.stack : '',
      }, params.callback);
    }
  }

  return jsonOutput_({
    ok: true,
    service: 'branark-closing-ledger-webapp',
    message: '브랜아크 일일마감 Apps Script Web App is running.',
  }, params.callback);
}

function doPost(e) {
  try {
    var payload = parsePayload_(e);
    var props = PropertiesService.getScriptProperties();
    var result = handlePayload_(payload, props);
    result.ok = true;

    if (payload.responseMode === 'postMessage') {
      return postMessageOutput_(result, payload.callbackId);
    }

    return jsonOutput_(result);
  } catch (error) {
    var fallbackPayload = {};
    try {
      fallbackPayload = parsePayload_(e);
    } catch (ignore) {}

    var response = {
      ok: false,
      callbackId: fallbackPayload.callbackId || '',
      error: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : '',
    };

    if (fallbackPayload.responseMode === 'postMessage') {
      return postMessageOutput_(response, fallbackPayload.callbackId);
    }

    return jsonOutput_(response);
  }
}

function handlePayload_(payload, props) {
  var expectedToken = props.getProperty('API_TOKEN');
  var allowPageUpload = String(props.getProperty('ALLOW_PAGE_UPLOAD') || '').toLowerCase() === 'true';
  var allowedPageOrigin = String(props.getProperty('ALLOWED_PAGE_ORIGIN') || 'https://livee0322.github.io').trim();
  var isPageUpload = payload.source === 'branark-index-html';

  if (payload.apiToken && expectedToken && payload.apiToken === expectedToken) {
    return runClosingLedgerProcess_(payload, props);
  }

  if (isPageUpload && allowPageUpload) {
    if (allowedPageOrigin && payload.pageOrigin !== allowedPageOrigin) {
      throw new Error('INVALID_PAGE_ORIGIN: 허용된 브랜아크 페이지에서 실행한 요청이 아닙니다.');
    }
    return runClosingLedgerProcess_(payload, props);
  }

  if (!expectedToken) {
    throw new Error('API_TOKEN script property가 비어 있습니다.');
  }

  throw new Error('INVALID_API_TOKEN');
}

function runClosingLedgerProcess_(payload, props) {
  var driveFolderId = requireValue_(props.getProperty('DRIVE_FOLDER_ID'), 'DRIVE_FOLDER_ID');
  var dailySheetId = requireValue_(props.getProperty('DAILY_SHEET_ID'), 'DAILY_SHEET_ID');
  var priceSheetId = requireValue_(props.getProperty('PRICE_SHEET_ID'), 'PRICE_SHEET_ID');

  var fileName = String(payload.fileName || payload.testFileName || payload.test_file_name || 'branark-closing-ledger-test.txt').trim();
  var orderDate = String(payload.orderDate || payload.order_date || Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd')).trim();
  var productName = String(payload.productName || payload.product_name || '[TEST] 브랜아크 일일마감 테스트').trim();
  var quantity = Number(payload.quantity || 1);
  var supplyPrice = Number(payload.supplyPrice || payload.supply_price || 0);
  var allowDuplicateFile = String(payload.allowDuplicateFile || payload.allow_duplicate_file || '').toLowerCase() === 'true';

  if (!fileName) {
    throw new Error('fileName 값이 비어 있습니다.');
  }

  if (!isFinite(quantity) || quantity <= 0) {
    throw new Error('quantity는 1 이상의 숫자여야 합니다.');
  }

  if (!isFinite(supplyPrice) || supplyPrice < 0) {
    throw new Error('supplyPrice는 0 이상의 숫자여야 합니다.');
  }

  var totalPrice = quantity * supplyPrice;
  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');

  var folder = DriveApp.getFolderById(driveFolderId);
  var duplicateFiles = folder.getFilesByName(fileName);
  if (duplicateFiles.hasNext() && !allowDuplicateFile) {
    throw new Error('DUPLICATE_FILE_NAME: 같은 파일명이 이미 있습니다. 파일명을 바꾸거나 allow_duplicate_file을 true로 실행하세요.');
  }

  var createdFile;
  if (payload.fileBase64) {
    var bytes = Utilities.base64Decode(String(payload.fileBase64));
    var mimeType = String(payload.fileMimeType || MimeType.PLAIN_TEXT);
    var blob = Utilities.newBlob(bytes, mimeType, fileName);
    createdFile = folder.createFile(blob);
  } else {
    var fileBody = [
      '브랜아크 일일마감 자동화 Apps Script 테스트',
      '생성시각: ' + now,
      '주문일: ' + orderDate,
      '상품명: ' + productName,
      '수량: ' + quantity,
      '공급단가: ' + supplyPrice,
      '공급가 합계: ' + totalPrice,
      '비고: GitHub Actions -> Apps Script 실제 구동 테스트',
    ].join('\n');
    createdFile = folder.createFile(fileName, fileBody, MimeType.PLAIN_TEXT);
  }

  var priceFile = DriveApp.getFileById(priceSheetId);
  var spreadsheet = SpreadsheetApp.openById(dailySheetId);
  var sheet = spreadsheet.getSheets()[0];
  var memo = '[TEST] Apps Script 실제 구동 / Drive file ID: ' + createdFile.getId();
  sheet.appendRow([orderDate, productName, quantity, supplyPrice, totalPrice, memo]);

  return {
    callbackId: payload.callbackId || '',
    driveFolderId: driveFolderId,
    driveFolderName: folder.getName(),
    fileId: createdFile.getId(),
    fileName: createdFile.getName(),
    fileUrl: createdFile.getUrl(),
    priceFileId: priceSheetId,
    priceFileName: priceFile.getName(),
    dailySheetId: dailySheetId,
    spreadsheetTitle: spreadsheet.getName(),
    sheetName: sheet.getName(),
    appendedRow: sheet.getLastRow(),
  };
}

function parsePayload_(e) {
  if (!e) {
    throw new Error('요청 정보가 비어 있습니다.');
  }

  if (e.postData && e.postData.contents && String(e.postData.type || '').indexOf('application/json') >= 0) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (error) {
      throw new Error('POST body JSON 파싱 실패: ' + error.message);
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

  throw new Error('POST body가 비어 있습니다.');
}

function requireValue_(value, name) {
  if (!value) {
    throw new Error(name + ' script property가 비어 있습니다.');
  }
  return String(value).trim();
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

function postMessageOutput_(object, callbackId) {
  object.callbackId = callbackId || object.callbackId || '';
  var json = JSON.stringify(object).replace(/</g, '\\u003c');
  var html = '<!doctype html><html><body><script>' +
    'window.top.postMessage(' + json + ', "*");' +
    '</script></body></html>';
  return HtmlService.createHtmlOutput(html);
}

function sanitizeCallbackName_(name) {
  var callback = String(name || '').trim();
  if (!/^[A-Za-z_$][0-9A-Za-z_$]*(\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callback)) {
    throw new Error('callback 이름이 올바르지 않습니다.');
  }
  return callback;
}
