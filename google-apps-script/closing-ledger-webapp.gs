/**
 * Branark closing ledger web app
 *
 * Required Script Properties
 * - API_TOKEN
 * - DRIVE_FOLDER_ID
 * - DAILY_SHEET_ID
 * - PRICE_SHEET_ID
 * - ALLOW_PAGE_UPLOAD=true
 * - ALLOWED_PAGE_ORIGIN=https://livee0322.github.io
 *
 * Advanced Services
 * - Drive API must be enabled for xlsx/xls -> Google Sheet conversion.
 */

var TIMEZONE = 'Asia/Seoul';
var DEFAULT_PAGE_ORIGIN = 'https://livee0322.github.io';
var MAX_HEADER_SCAN_ROWS = 10;
var SOURCE_SHEET_PRIORITY = ['운송장', '출고일지', '출고일지(2)'];
var DAILY_HEADER_ALIASES = {
  orderDate: ['주문일', '결제일', '발주일', '주문일자'],
  productName: ['상품명', '상품명1', '제품명', '옵션상품명', '품목명'],
  quantity: ['수량', '주문수량', '구매수량', '출고수량', '상품수량'],
  supplyPrice: ['공급단가', '단가', '공급가', '매입가'],
  totalPrice: ['공급가 합계', '공급가합계', '합계', '금액'],
  memo: ['비고', '메모', '참고', '비고사항']
};
var SOURCE_HEADER_ALIASES = {
  orderDate: ['주문일', '결제일', '발주일', '주문일자'],
  salesChannel: ['판매처', '쇼핑몰', '채널', '주문경로'],
  orderNumber: ['주문번호', '주문건번호', '주문id', '주문 번호'],
  productName: ['상품명', '상품명1', '제품명', '옵션상품명', '품목명'],
  optionName: ['옵션명', '옵션정보', '옵션', '규격'],
  quantity: ['수량', '주문수량', '구매수량', '출고수량', '상품수량'],
  amount: ['공급가', '공급가합계', '공급가 합계', '판매가', '결제금액']
};
var PRICE_HEADER_ALIASES = {
  productName: ['상품명', '제품명', '품목명'],
  supplyPrice: ['공급단가', '단가', '공급가', '매입가']
};

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
      message: 'Branark closing ledger Apps Script Web App is running.'
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
  var checkedAt = formatNow_();
  var missingProperties = [];

  var apiToken = String(props.getProperty('API_TOKEN') || '').trim();
  var driveFolderId = String(props.getProperty('DRIVE_FOLDER_ID') || '').trim();
  var dailySheetId = String(props.getProperty('DAILY_SHEET_ID') || '').trim();
  var priceSheetId = String(props.getProperty('PRICE_SHEET_ID') || '').trim();
  var allowPageUpload = String(props.getProperty('ALLOW_PAGE_UPLOAD') || '').toLowerCase() === 'true';
  var allowedPageOrigin = String(props.getProperty('ALLOWED_PAGE_ORIGIN') || DEFAULT_PAGE_ORIGIN).trim();
  var pageUploadOk = allowPageUpload && allowedPageOrigin === DEFAULT_PAGE_ORIGIN;
  var pageUploadIssueCode = '';
  var pageUploadUserMessage = '';

  if (!allowPageUpload) {
    pageUploadIssueCode = 'PAGE_UPLOAD_DISABLED';
    pageUploadUserMessage = '페이지 업로드가 허용되지 않았습니다. ALLOW_PAGE_UPLOAD=true 설정이 필요합니다.';
  } else if (allowedPageOrigin !== DEFAULT_PAGE_ORIGIN) {
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
    scope: '발주서 파일 분석 + 일일마감 자동 반영',
    apiTokenConfigured: Boolean(apiToken),
    missingProperties: missingProperties,
    pageUpload: {
      ok: pageUploadOk,
      allowPageUpload: allowPageUpload,
      allowedPageOrigin: allowedPageOrigin,
      expectedPageOrigin: DEFAULT_PAGE_ORIGIN,
      issueCode: pageUploadIssueCode,
      userMessage: pageUploadUserMessage
    },
    drive: driveStatus,
    dailySheet: dailySheetStatus,
    price: priceStatus,
    healthOk: missingProperties.length === 0 && pageUploadOk && driveStatus.ok && dailySheetStatus.ok && priceStatus.ok
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
      name: folder.getName()
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
    var headerInfo = detectHeaderRowAndColumns_(spreadsheet.getSheets()[0].getDataRange().getDisplayValues(), DAILY_HEADER_ALIASES, ['orderDate', 'productName', 'quantity', 'supplyPrice', 'totalPrice', 'memo']);
    return {
      ok: true,
      id: spreadsheet.getId(),
      spreadsheetTitle: spreadsheet.getName(),
      sheetName: spreadsheet.getSheets()[0].getName(),
      lastRow: spreadsheet.getSheets()[0].getLastRow(),
      headerOk: Boolean(headerInfo),
      headerRow: headerInfo ? headerInfo.headerRowNumber : null
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
    var resource = readPriceResource_(priceSheetId, false);
    return {
      ok: true,
      id: resource.id,
      name: resource.name,
      type: resource.type,
      sheetName: resource.sheetName || '',
      previewAvailable: resource.previewRows.length > 0,
      previewRows: resource.previewRows,
      previewMessage: resource.previewRows.length > 0
        ? '단가표 상위 일부 행을 검토용으로 표시합니다.'
        : '단가표에는 접근했지만 미리보기 행을 읽지 못했습니다.'
    };
  } catch (error) {
    return resourceError_('PRICE_RESOURCE_ACCESS_FAILED', '단가표 파일 또는 시트에 접근하지 못했습니다.', error);
  }
}

function handlePayload_(payload, props) {
  var expectedToken = String(props.getProperty('API_TOKEN') || '').trim();
  var allowPageUpload = String(props.getProperty('ALLOW_PAGE_UPLOAD') || '').toLowerCase() === 'true';
  var allowedPageOrigin = String(props.getProperty('ALLOWED_PAGE_ORIGIN') || DEFAULT_PAGE_ORIGIN).trim();
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
  var mode = determineProcessMode_(payload);
  if (mode === 'manual-test') {
    return runManualTestProcess_(payload, props);
  }
  return runAutoClosingLedgerProcess_(payload, props, mode);
}

function determineProcessMode_(payload) {
  var explicitMode = String(payload.mode || '').trim();
  if (explicitMode) {
    return explicitMode;
  }
  if (payload.sampleCsvContent || payload.sample_csv_content) {
    return 'sample-csv-test';
  }
  if (payload.fileBase64 || payload.file_base64) {
    return 'auto-closing-ledger';
  }
  return 'manual-test';
}

function runAutoClosingLedgerProcess_(payload, props, mode) {
  var driveFolderId = requireValue_(props.getProperty('DRIVE_FOLDER_ID'), 'DRIVE_FOLDER_ID');
  var dailySheetId = requireValue_(props.getProperty('DAILY_SHEET_ID'), 'DAILY_SHEET_ID');
  var priceSheetId = requireValue_(props.getProperty('PRICE_SHEET_ID'), 'PRICE_SHEET_ID');
  var fileName = resolveIncomingFileName_(payload);
  var allowDuplicateFile = parseBoolean_(payload.allowDuplicateFile || payload.allow_duplicate_file);
  var keepTemporaryFiles = parseBoolean_(payload.keepTemporaryFiles || payload.keep_temporary_files);

  if (!fileName) {
    throw appError_('INVALID_FILE_NAME', '파일명이 비어 있습니다.');
  }

  var folder = getDriveFolderOrThrow_(driveFolderId);
  if (folder.getFilesByName(fileName).hasNext() && !allowDuplicateFile) {
    throw appError_('DUPLICATE_FILE_NAME', '같은 파일명이 이미 Google Drive 폴더에 있습니다.');
  }

  var uploaded = saveIncomingFile_(payload, folder, fileName, mode);
  var warnings = [];
  var errors = [];
  var temporaryFileIds = [];

  try {
    var parsedResult = parseOrderFile_(uploaded, payload, keepTemporaryFiles);
    temporaryFileIds = parsedResult.temporaryFileIds.slice();
    warnings = warnings.concat(parsedResult.warnings);
    errors = errors.concat(parsedResult.errors);

    var aggregatedResult = aggregateParsedRows_(parsedResult.rows, uploaded.fileName, uploaded.fileId);
    warnings = warnings.concat(aggregatedResult.warnings);
    errors = errors.concat(aggregatedResult.errors);

    if (!aggregatedResult.rows.length) {
      errors.push({
        code: 'NO_NORMALIZED_ROWS',
        message: '정규화된 결과 행이 0건입니다.'
      });
    }

    var priceResult = matchPrices_(aggregatedResult.rows, priceSheetId, keepTemporaryFiles);
    temporaryFileIds = temporaryFileIds.concat(priceResult.temporaryFileIds);
    warnings = warnings.concat(priceResult.warnings);
    errors = errors.concat(priceResult.errors);

    var blockingErrors = collectBlockingErrors_(errors);
    var appendResult = {
      spreadsheetTitle: '',
      sheetName: '',
      startRow: 0,
      endRow: 0,
      rowCount: 0
    };

    if (blockingErrors.length === 0) {
      appendResult = appendClosingLedgerRows_(dailySheetId, priceResult.rows);
    } else {
      throw appError_('AUTO_CLOSING_LEDGER_BLOCKED', '검증 오류가 있어 일일마감 반영을 중단했습니다.', JSON.stringify(blockingErrors));
    }

    return {
      callbackId: payload.callbackId || '',
      mode: 'auto-closing-ledger',
      uploadedFile: {
        fileId: uploaded.fileId,
        fileName: uploaded.fileName,
        fileUrl: uploaded.fileUrl,
        temporarySpreadsheetIds: temporaryFileIds
      },
      parsed: {
        sourceSheetNames: parsedResult.sourceSheetNames,
        sourceRowCount: parsedResult.sourceRowCount,
        normalizedRowCount: priceResult.rows.length
      },
      matched: {
        matchedCount: priceResult.matchedCount,
        unmatchedCount: priceResult.unmatchedCount
      },
      appended: appendResult,
      rows: priceResult.rows,
      aggregatedItems: aggregatedResult.aggregatedItems,
      priceMatches: priceResult.priceMatches,
      warnings: dedupeIssueList_(warnings),
      errors: dedupeIssueList_(errors)
    };
  } catch (error) {
    if (!keepTemporaryFiles) {
      trashFiles_(temporaryFileIds);
    }
    if (error && error.code === 'AUTO_CLOSING_LEDGER_BLOCKED') {
      var blockedErrors = dedupeIssueList_(errors);
      throw appError_('AUTO_CLOSING_LEDGER_BLOCKED', '검증 오류가 있어 일일마감 반영을 중단했습니다.', JSON.stringify(blockedErrors));
    }
    throw error;
  } finally {
    if (!keepTemporaryFiles) {
      trashFiles_(temporaryFileIds);
    }
  }
}

function runManualTestProcess_(payload, props) {
  var driveFolderId = requireValue_(props.getProperty('DRIVE_FOLDER_ID'), 'DRIVE_FOLDER_ID');
  var dailySheetId = requireValue_(props.getProperty('DAILY_SHEET_ID'), 'DAILY_SHEET_ID');
  var fileName = resolveIncomingFileName_(payload) || ('branark-manual-test-' + formatDate_(new Date(), 'yyyyMMdd_HHmmss') + '.txt');
  var orderDate = String(payload.orderDate || '').trim();
  var productName = String(payload.productName || '').trim();
  var quantity = toNumberStrict_(payload.quantity);
  var supplyPrice = toNumberStrict_(payload.supplyPrice);
  var totalPrice = quantity * supplyPrice;
  var memo = '[MANUAL TEST] 원본 파일 파싱 없이 수동 테스트 행 작성';

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

  var folder = getDriveFolderOrThrow_(driveFolderId);
  var textFile = folder.createFile(fileName, memo, MimeType.PLAIN_TEXT);
  var appendResult = appendClosingLedgerRows_(dailySheetId, [{
    orderDate: orderDate,
    productName: productName,
    normalizedProductName: normalizeProductName_(productName).name,
    quantity: quantity,
    supplyPrice: supplyPrice,
    totalPrice: totalPrice,
    sourceSheetName: 'manual-test',
    memo: memo + ' / Drive file ID: ' + textFile.getId()
  }]);

  return {
    callbackId: payload.callbackId || '',
    mode: 'manual-test',
    uploadedFile: {
      fileId: textFile.getId(),
      fileName: textFile.getName(),
      fileUrl: textFile.getUrl()
    },
    parsed: {
      sourceSheetNames: ['manual-test'],
      sourceRowCount: 1,
      normalizedRowCount: 1
    },
    matched: {
      matchedCount: 1,
      unmatchedCount: 0
    },
    appended: appendResult,
    rows: [{
      orderDate: orderDate,
      productName: productName,
      normalizedProductName: normalizeProductName_(productName).name,
      quantity: quantity,
      supplyPrice: supplyPrice,
      totalPrice: totalPrice,
      memo: memo
    }],
    warnings: [],
    errors: []
  };
}

function saveIncomingFile_(payload, folder, fileName, mode) {
  var sampleCsvContent = String(payload.sampleCsvContent || payload.sample_csv_content || '');
  var fileBase64 = String(payload.fileBase64 || payload.file_base64 || '').trim();
  var mimeType = String(payload.fileMimeType || payload.file_mime_type || guessMimeTypeFromFileName_(fileName));
  var blob;

  if (sampleCsvContent) {
    blob = Utilities.newBlob(sampleCsvContent, MimeType.CSV, fileName);
  } else if (fileBase64) {
    blob = Utilities.newBlob(Utilities.base64Decode(fileBase64), mimeType || 'application/octet-stream', fileName);
  } else {
    throw appError_('MISSING_FILE_CONTENT', '업로드 파일 내용이 비어 있습니다.');
  }

  try {
    var createdFile = folder.createFile(blob);
    return {
      fileId: createdFile.getId(),
      fileName: createdFile.getName(),
      fileUrl: createdFile.getUrl(),
      mimeType: mimeType,
      blob: blob,
      mode: mode,
      sampleCsvContent: sampleCsvContent
    };
  } catch (error) {
    throw appError_('DRIVE_UPLOAD_FAILED', 'Google Drive에 파일을 저장하지 못했습니다.', error.message);
  }
}

function parseOrderFile_(uploaded, payload, keepTemporaryFiles) {
  var fileName = uploaded.fileName;
  var extension = getFileExtension_(fileName);
  if (extension === 'csv') {
    return parseCsvContentAsRows_(uploaded.sampleCsvContent || uploaded.blob.getDataAsString('UTF-8'), fileName);
  }
  if (extension === 'xlsx' || extension === 'xls') {
    return parseSpreadsheetBlobAsRows_(uploaded.blob, fileName, keepTemporaryFiles);
  }
  throw appError_('UNSUPPORTED_FILE_TYPE', '지원하지 않는 파일 형식입니다. csv, xlsx, xls 파일만 처리할 수 있습니다.');
}

function parseCsvContentAsRows_(csvContent, fileName) {
  try {
    var rows = Utilities.parseCsv(csvContent);
    var sheetData = {
      name: 'CSV',
      values: rows
    };
    var parsed = parseSheetValues_(sheetData, fileName);
    parsed.sourceSheetNames = ['CSV'];
    return parsed;
  } catch (error) {
    throw appError_('CSV_PARSE_FAILED', 'CSV 파일을 읽지 못했습니다.', error.message);
  }
}

function parseSpreadsheetBlobAsRows_(blob, fileName, keepTemporaryFiles) {
  var tempSpreadsheetId = '';
  try {
    tempSpreadsheetId = convertBlobToSpreadsheet_(blob, fileName);
    var spreadsheet = SpreadsheetApp.openById(tempSpreadsheetId);
    var sheets = spreadsheet.getSheets();
    var candidateSheets = [];
    var sheetNameIndex = {};
    var allRows = [];
    var warnings = [];
    var errors = [];

    for (var i = 0; i < sheets.length; i += 1) {
      var values = sheets[i].getDataRange().getDisplayValues();
      if (isValuesEmpty_(values)) {
        continue;
      }
      var candidate = inspectSourceSheetCandidate_(sheets[i].getName(), values);
      if (candidate) {
        candidateSheets.push(candidate);
        sheetNameIndex[candidate.name] = true;
      }
    }

    for (var priorityIndex = 0; priorityIndex < SOURCE_SHEET_PRIORITY.length; priorityIndex += 1) {
      var priorityName = SOURCE_SHEET_PRIORITY[priorityIndex];
      for (var sheetIndex = 0; sheetIndex < sheets.length; sheetIndex += 1) {
        var sheet = sheets[sheetIndex];
        if (sheet.getName() === priorityName && !sheetNameIndex[priorityName]) {
          var sheetValues = sheet.getDataRange().getDisplayValues();
          if (!isValuesEmpty_(sheetValues)) {
            var forcedCandidate = inspectSourceSheetCandidate_(sheet.getName(), sheetValues, true);
            if (forcedCandidate) {
              candidateSheets.unshift(forcedCandidate);
              sheetNameIndex[priorityName] = true;
            }
          }
        }
      }
    }

    if (!candidateSheets.length) {
      throw appError_('SOURCE_SHEET_NOT_FOUND', '운송장/출고일지 후보 시트를 찾지 못했습니다.');
    }

    var seenNames = {};
    var uniqueCandidates = [];
    for (var candidateIndex = 0; candidateIndex < candidateSheets.length; candidateIndex += 1) {
      if (!seenNames[candidateSheets[candidateIndex].name]) {
        uniqueCandidates.push(candidateSheets[candidateIndex]);
        seenNames[candidateSheets[candidateIndex].name] = true;
      }
    }

    for (var parseIndex = 0; parseIndex < uniqueCandidates.length; parseIndex += 1) {
      var parsedSheet = parseSheetValues_(uniqueCandidates[parseIndex], fileName);
      allRows = allRows.concat(parsedSheet.rows);
      warnings = warnings.concat(parsedSheet.warnings);
      errors = errors.concat(parsedSheet.errors);
    }

    return {
      rows: allRows,
      warnings: warnings,
      errors: errors,
      sourceRowCount: allRows.length,
      sourceSheetNames: uniqueCandidates.map(function(candidate) { return candidate.name; }),
      temporaryFileIds: keepTemporaryFiles ? [tempSpreadsheetId] : [tempSpreadsheetId]
    };
  } catch (error) {
    if (!tempSpreadsheetId) {
      throw appError_('FILE_CONVERSION_FAILED', '엑셀 파일을 Google Sheet로 변환하지 못했습니다.', error.message);
    }
    throw error;
  }
}

function inspectSourceSheetCandidate_(sheetName, values, forceInclude) {
  var headerInfo = detectHeaderRowAndColumns_(values, SOURCE_HEADER_ALIASES, ['productName', 'quantity']);
  if (!headerInfo && !forceInclude) {
    return null;
  }
  if (!headerInfo && forceInclude) {
    return null;
  }

  var score = headerInfo.score;
  if (SOURCE_SHEET_PRIORITY.indexOf(sheetName) >= 0) {
    score += 50;
  }
  return {
    name: sheetName,
    values: values,
    headerInfo: headerInfo,
    score: score
  };
}

function parseSheetValues_(sheetData, fileName) {
  var values = sheetData.values;
  var headerInfo = sheetData.headerInfo || detectHeaderRowAndColumns_(values, SOURCE_HEADER_ALIASES, ['productName', 'quantity']);
  var rows = [];
  var warnings = [];
  var errors = [];

  if (!headerInfo) {
    errors.push(issue_('SOURCE_HEADER_NOT_FOUND', sheetData.name + ' 시트에서 상품명/수량 헤더를 찾지 못했습니다.', sheetData.name));
    return {
      rows: rows,
      warnings: warnings,
      errors: errors,
      sourceRowCount: 0
    };
  }

  for (var rowIndex = headerInfo.headerRowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    var row = values[rowIndex];
    if (isRowEmpty_(row)) {
      continue;
    }

    var rawProductName = getRowCell_(row, headerInfo.columns.productName);
    var optionName = getRowCell_(row, headerInfo.columns.optionName);
    var quantityText = getRowCell_(row, headerInfo.columns.quantity);
    var orderDateText = getRowCell_(row, headerInfo.columns.orderDate);
    var orderNumber = getRowCell_(row, headerInfo.columns.orderNumber);
    var salesChannel = getRowCell_(row, headerInfo.columns.salesChannel);
    var amountText = getRowCell_(row, headerInfo.columns.amount);

    if (!rawProductName && optionName) {
      rawProductName = optionName;
    }

    if (!rawProductName) {
      errors.push(issue_('PRODUCT_NAME_NOT_FOUND', sheetData.name + ' 시트에서 상품명 값을 읽지 못했습니다.', sheetData.name, rowIndex + 1));
      continue;
    }

    var quantityValue = toNumberStrict_(quantityText);
    if (!isFinite(quantityValue)) {
      errors.push(issue_('INVALID_QUANTITY', sheetData.name + ' 시트의 수량이 숫자가 아닙니다.', sheetData.name, rowIndex + 1));
      continue;
    }

    var normalized = normalizeProductName_(rawProductName);
    var finalQuantity = quantityValue * normalized.quantityMultiplier;
    var amountValue = toNumberStrict_(amountText);

    rows.push({
      sourceSheetName: sheetData.name,
      sourceRowNumber: rowIndex + 1,
      orderDate: normalizeOrderDate_(orderDateText, fileName),
      orderNumber: orderNumber,
      salesChannel: salesChannel,
      rawProductName: rawProductName,
      optionName: optionName,
      normalizedProductName: normalized.name,
      quantity: finalQuantity,
      amount: isFinite(amountValue) ? amountValue : null
    });
  }

  return {
    rows: rows,
    warnings: warnings,
    errors: errors,
    sourceRowCount: rows.length
  };
}

function aggregateParsedRows_(rows, fileName, fileId) {
  var map = {};
  var aggregatedItems = [];
  var warnings = [];
  var errors = [];

  for (var i = 0; i < rows.length; i += 1) {
    var row = rows[i];
    if (!row.normalizedProductName) {
      errors.push(issue_('NORMALIZED_PRODUCT_NAME_EMPTY', '정규화 상품명이 비어 있습니다.', row.sourceSheetName, row.sourceRowNumber));
      continue;
    }
    var orderDate = row.orderDate || inferDateFromFileName_(fileName) || formatDate_(new Date(), 'yyyy-MM-dd');
    var key = [orderDate, row.normalizedProductName].join('||');
    if (!map[key]) {
      map[key] = {
        orderDate: orderDate,
        productName: row.rawProductName,
        normalizedProductName: row.normalizedProductName,
        quantity: 0,
        rawProductNames: {},
        sourceSheetNames: {},
        orderNumbers: {},
        salesChannels: {},
        memoParts: []
      };
    }

    map[key].quantity += row.quantity;
    map[key].rawProductNames[row.rawProductName] = true;
    map[key].sourceSheetNames[row.sourceSheetName] = true;
    if (row.orderNumber) {
      map[key].orderNumbers[row.orderNumber] = true;
    }
    if (row.salesChannel) {
      map[key].salesChannels[row.salesChannel] = true;
    }
  }

  var keys = Object.keys(map);
  for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    var item = map[keys[keyIndex]];
    var rawNames = Object.keys(item.rawProductNames);
    if (rawNames.length > 1) {
      warnings.push(issue_('MULTIPLE_RAW_PRODUCT_NAMES', '같은 정규화 상품명에 여러 원본 상품명이 매핑되었습니다: ' + rawNames.join(', ')));
    }
    aggregatedItems.push({
      orderDate: item.orderDate,
      productName: rawNames[0],
      normalizedProductName: item.normalizedProductName,
      quantity: item.quantity,
      rawProductNames: rawNames,
      sourceSheetNames: Object.keys(item.sourceSheetNames),
      orderNumbers: Object.keys(item.orderNumbers),
      salesChannels: Object.keys(item.salesChannels),
      memoBase: '원본 파일명: ' + fileName + ' / 원본 시트: ' + Object.keys(item.sourceSheetNames).join(', ') + ' / Drive file ID: ' + fileId
    });
  }

  aggregatedItems.sort(function(a, b) {
    if (a.orderDate === b.orderDate) {
      return a.normalizedProductName > b.normalizedProductName ? 1 : -1;
    }
    return a.orderDate > b.orderDate ? 1 : -1;
  });

  return {
    rows: aggregatedItems,
    aggregatedItems: aggregatedItems,
    warnings: warnings,
    errors: errors
  };
}

function matchPrices_(rows, priceSheetId, keepTemporaryFiles) {
  var priceResource = readPriceResource_(priceSheetId, keepTemporaryFiles);
  var priceMap = priceResource.priceMap;
  var normalizedPriceMap = priceResource.normalizedPriceMap;
  var resultRows = [];
  var priceMatches = [];
  var warnings = [];
  var errors = [];
  var matchedCount = 0;
  var unmatchedCount = 0;

  for (var i = 0; i < rows.length; i += 1) {
    var item = rows[i];
    var exact = priceMap[item.productName];
    var normalized = normalizedPriceMap[item.normalizedProductName];
    var matched = exact || normalized;
    if (!matched) {
      unmatchedCount += 1;
      errors.push(issue_('PRICE_NOT_FOUND', '단가표에서 상품명을 찾지 못했습니다: ' + item.normalizedProductName));
      priceMatches.push({
        productName: item.productName,
        normalizedProductName: item.normalizedProductName,
        matched: false,
        matchedBy: '',
        supplyPrice: null
      });
      continue;
    }

    matchedCount += 1;
    var supplyPrice = matched.price;
    var memo = item.memoBase + ' / 처리 시각: ' + formatNow_();
    resultRows.push({
      orderDate: item.orderDate,
      productName: item.productName,
      normalizedProductName: item.normalizedProductName,
      quantity: item.quantity,
      supplyPrice: supplyPrice,
      totalPrice: item.quantity * supplyPrice,
      memo: memo,
      sourceSheetName: item.sourceSheetNames.join(', ')
    });
    priceMatches.push({
      productName: item.productName,
      normalizedProductName: item.normalizedProductName,
      matched: true,
      matchedBy: matched.by,
      supplyPrice: supplyPrice
    });
  }

  return {
    rows: resultRows,
    priceMatches: priceMatches,
    matchedCount: matchedCount,
    unmatchedCount: unmatchedCount,
    warnings: warnings,
    errors: errors,
    temporaryFileIds: priceResource.temporaryFileIds
  };
}

function readPriceResource_(priceSheetId, keepTemporaryFiles) {
  var temporaryFileIds = [];

  try {
    var spreadsheet = SpreadsheetApp.openById(priceSheetId);
    return buildPriceMapFromSpreadsheet_(spreadsheet, temporaryFileIds);
  } catch (spreadsheetError) {
    try {
      var file = DriveApp.getFileById(priceSheetId);
      var extension = getFileExtension_(file.getName());
      if (extension !== 'xlsx' && extension !== 'xls') {
        throw spreadsheetError;
      }
      var tempSpreadsheetId = convertBlobToSpreadsheet_(file.getBlob(), file.getName());
      temporaryFileIds.push(tempSpreadsheetId);
      var tempSpreadsheet = SpreadsheetApp.openById(tempSpreadsheetId);
      return buildPriceMapFromSpreadsheet_(tempSpreadsheet, temporaryFileIds);
    } catch (fileError) {
      throw appError_('PRICE_RESOURCE_ACCESS_FAILED', '단가표 파일 또는 시트에 접근하지 못했습니다.', fileError.message || spreadsheetError.message);
    }
  }
}

function buildPriceMapFromSpreadsheet_(spreadsheet, temporaryFileIds) {
  var sheet = spreadsheet.getSheets()[0];
  var values = sheet.getDataRange().getDisplayValues();
  var headerInfo = detectHeaderRowAndColumns_(values, PRICE_HEADER_ALIASES, ['productName', 'supplyPrice']);
  if (!headerInfo) {
    throw appError_('PRICE_HEADER_NOT_FOUND', '단가표에서 상품명/공급단가 헤더를 찾지 못했습니다.');
  }

  var priceMap = {};
  var normalizedPriceMap = {};
  var previewRows = [];

  for (var rowIndex = headerInfo.headerRowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    var row = values[rowIndex];
    if (isRowEmpty_(row)) {
      continue;
    }
    var productName = getRowCell_(row, headerInfo.columns.productName);
    var supplyPrice = toNumberStrict_(getRowCell_(row, headerInfo.columns.supplyPrice));
    if (!productName || !isFinite(supplyPrice)) {
      continue;
    }
    var normalized = normalizeProductName_(productName).name;
    if (!priceMap[productName]) {
      priceMap[productName] = { price: supplyPrice, by: 'exact' };
    }
    if (!normalizedPriceMap[normalized]) {
      normalizedPriceMap[normalized] = { price: supplyPrice, by: 'normalized' };
    }
    if (previewRows.length < 5) {
      previewRows.push([productName, supplyPrice]);
    }
  }

  return {
    id: spreadsheet.getId(),
    name: spreadsheet.getName(),
    type: 'spreadsheet',
    sheetName: sheet.getName(),
    priceMap: priceMap,
    normalizedPriceMap: normalizedPriceMap,
    previewRows: previewRows,
    temporaryFileIds: temporaryFileIds
  };
}

function appendClosingLedgerRows_(dailySheetId, rows) {
  if (!rows.length) {
    throw appError_('NO_APPEND_ROWS', '일일마감에 반영할 결과 행이 0건입니다.');
  }

  var spreadsheet;
  var sheet;
  try {
    spreadsheet = SpreadsheetApp.openById(dailySheetId);
    sheet = spreadsheet.getSheets()[0];
  } catch (error) {
    throw appError_('DAILY_SHEET_ACCESS_FAILED', '일일마감 시트에 접근하지 못했습니다.', error.message);
  }

  var values = sheet.getDataRange().getDisplayValues();
  var headerInfo = detectHeaderRowAndColumns_(values, DAILY_HEADER_ALIASES, ['orderDate', 'productName', 'quantity', 'supplyPrice', 'totalPrice', 'memo']);
  if (!headerInfo) {
    throw appError_('DAILY_SHEET_HEADER_MISSING', '일일마감 시트 헤더를 찾지 못했습니다.');
  }

  var headerLength = values[headerInfo.headerRowIndex] ? values[headerInfo.headerRowIndex].length : 6;
  var appendRows = [];
  for (var i = 0; i < rows.length; i += 1) {
    var row = new Array(headerLength);
    for (var columnIndex = 0; columnIndex < headerLength; columnIndex += 1) {
      row[columnIndex] = '';
    }
    row[headerInfo.columns.orderDate] = rows[i].orderDate;
    row[headerInfo.columns.productName] = rows[i].normalizedProductName;
    row[headerInfo.columns.quantity] = rows[i].quantity;
    row[headerInfo.columns.supplyPrice] = rows[i].supplyPrice;
    row[headerInfo.columns.totalPrice] = rows[i].totalPrice;
    row[headerInfo.columns.memo] = rows[i].memo;
    appendRows.push(row);
  }

  var startRow = Math.max(sheet.getLastRow() + 1, headerInfo.headerRowNumber + 1);
  var targetRange = sheet.getRange(startRow, 1, appendRows.length, headerLength);
  try {
    targetRange.setValues(appendRows);
  } catch (error) {
    throw appError_('DAILY_SHEET_APPEND_FAILED', '일일마감 시트에 결과 행을 추가하지 못했습니다.', error.message);
  }

  return {
    spreadsheetTitle: spreadsheet.getName(),
    sheetName: sheet.getName(),
    startRow: startRow,
    endRow: startRow + appendRows.length - 1,
    rowCount: appendRows.length
  };
}

function convertBlobToSpreadsheet_(blob, fileName) {
  if (typeof Drive === 'undefined' || !Drive.Files || !Drive.Files.insert) {
    throw appError_('FILE_CONVERSION_UNAVAILABLE', 'Drive API 고급 서비스가 활성화되지 않아 엑셀 파일을 변환할 수 없습니다.');
  }

  var resource = {
    title: '[TEMP] ' + fileName,
    mimeType: MimeType.GOOGLE_SHEETS
  };

  try {
    var inserted = Drive.Files.insert(resource, blob, {
      convert: true,
      supportsAllDrives: true
    });
    return inserted.id;
  } catch (error) {
    throw appError_('FILE_CONVERSION_FAILED', '엑셀 파일을 Google Sheet로 변환하지 못했습니다.', error.message);
  }
}

function detectHeaderRowAndColumns_(values, aliases, requiredKeys) {
  if (!values || !values.length) {
    return null;
  }

  for (var rowIndex = 0; rowIndex < Math.min(values.length, MAX_HEADER_SCAN_ROWS); rowIndex += 1) {
    var row = values[rowIndex];
    if (!row || !row.length) {
      continue;
    }
    var columns = {};
    var score = 0;
    for (var columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      var normalizedHeader = normalizeHeaderText_(row[columnIndex]);
      if (!normalizedHeader) {
        continue;
      }
      for (var key in aliases) {
        if (!aliases.hasOwnProperty(key) || columns[key] !== undefined) {
          continue;
        }
        var aliasList = aliases[key];
        for (var aliasIndex = 0; aliasIndex < aliasList.length; aliasIndex += 1) {
          if (normalizeHeaderText_(aliasList[aliasIndex]) === normalizedHeader) {
            columns[key] = columnIndex;
            score += 1;
            break;
          }
        }
      }
    }

    var hasRequired = true;
    for (var requiredIndex = 0; requiredIndex < requiredKeys.length; requiredIndex += 1) {
      if (columns[requiredKeys[requiredIndex]] === undefined) {
        hasRequired = false;
        break;
      }
    }

    if (hasRequired) {
      return {
        headerRowIndex: rowIndex,
        headerRowNumber: rowIndex + 1,
        columns: columns,
        score: score
      };
    }
  }

  return null;
}

function normalizeHeaderText_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[(){}\[\]\-_/]/g, '')
    .trim();
}

function normalizeProductName_(rawName) {
  var text = String(rawName || '').trim().replace(/\s+/g, ' ');
  var multiplier = 1;
  var suffixMatch = text.match(/_(\d+)\s*$/);
  if (suffixMatch) {
    multiplier = Number(suffixMatch[1]) || 1;
    text = text.replace(/_(\d+)\s*$/, '').trim();
  }
  text = text
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    name: text,
    quantityMultiplier: multiplier
  };
}

function normalizeOrderDate_(value, fileName) {
  var text = String(value || '').trim();
  if (!text) {
    return inferDateFromFileName_(fileName) || '';
  }

  var direct = text.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (direct) {
    return direct[1] + '-' + pad2_(direct[2]) + '-' + pad2_(direct[3]);
  }

  var compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return compact[1] + '-' + compact[2] + '-' + compact[3];
  }

  return inferDateFromFileName_(fileName) || text;
}

function inferDateFromFileName_(fileName) {
  var text = String(fileName || '');
  var fullMatch = text.match(/(20\d{2})(\d{2})(\d{2})/);
  if (fullMatch) {
    return fullMatch[1] + '-' + fullMatch[2] + '-' + fullMatch[3];
  }
  var shortMatch = text.match(/(\d{2})(\d{2})(\d{2})/);
  if (shortMatch) {
    return '20' + shortMatch[1] + '-' + shortMatch[2] + '-' + shortMatch[3];
  }
  return '';
}

function getDriveFolderOrThrow_(driveFolderId) {
  try {
    return DriveApp.getFolderById(driveFolderId);
  } catch (error) {
    throw appError_('DRIVE_ACCESS_FAILED', 'Google Drive 발주서 폴더에 접근하지 못했습니다.', error.message);
  }
}

function resolveIncomingFileName_(payload) {
  return String(
    payload.fileName ||
    payload.testFileName ||
    payload.test_file_name ||
    ''
  ).trim();
}

function parseBoolean_(value) {
  return String(value || '').toLowerCase() === 'true';
}

function toNumberStrict_(value) {
  if (typeof value === 'number') {
    return value;
  }
  var text = String(value || '').replace(/[,\s원]/g, '').trim();
  if (!text) {
    return NaN;
  }
  var parsed = Number(text);
  return isFinite(parsed) ? parsed : NaN;
}

function getRowCell_(row, index) {
  if (index === undefined || index === null || !row || index >= row.length) {
    return '';
  }
  return String(row[index] || '').trim();
}

function isValuesEmpty_(values) {
  for (var rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
    if (!isRowEmpty_(values[rowIndex])) {
      return false;
    }
  }
  return true;
}

function isRowEmpty_(row) {
  if (!row) {
    return true;
  }
  for (var i = 0; i < row.length; i += 1) {
    if (String(row[i] || '').trim()) {
      return false;
    }
  }
  return true;
}

function collectBlockingErrors_(errors) {
  var blockingCodes = {
    SOURCE_HEADER_NOT_FOUND: true,
    PRODUCT_NAME_NOT_FOUND: true,
    INVALID_QUANTITY: true,
    PRICE_NOT_FOUND: true,
    DAILY_SHEET_ACCESS_FAILED: true,
    DAILY_SHEET_HEADER_MISSING: true,
    FILE_CONVERSION_FAILED: true,
    FILE_CONVERSION_UNAVAILABLE: true,
    NO_NORMALIZED_ROWS: true,
    NO_APPEND_ROWS: true
  };
  var list = [];
  for (var i = 0; i < errors.length; i += 1) {
    if (blockingCodes[errors[i].code]) {
      list.push(errors[i]);
    }
  }
  return list;
}

function issue_(code, message, sheetName, rowNumber) {
  return {
    code: code,
    message: message,
    sheetName: sheetName || '',
    rowNumber: rowNumber || null
  };
}

function dedupeIssueList_(issues) {
  var seen = {};
  var deduped = [];
  for (var i = 0; i < issues.length; i += 1) {
    var key = JSON.stringify(issues[i]);
    if (!seen[key]) {
      seen[key] = true;
      deduped.push(issues[i]);
    }
  }
  return deduped;
}

function trashFiles_(fileIds) {
  for (var i = 0; i < fileIds.length; i += 1) {
    if (!fileIds[i]) {
      continue;
    }
    try {
      DriveApp.getFileById(fileIds[i]).setTrashed(true);
    } catch (ignore) {}
  }
}

function formatNow_() {
  return Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
}

function formatDate_(date, pattern) {
  return Utilities.formatDate(date, TIMEZONE, pattern);
}

function pad2_(value) {
  return ('0' + Number(value)).slice(-2);
}

function getFileExtension_(fileName) {
  var index = String(fileName || '').lastIndexOf('.');
  if (index < 0) {
    return '';
  }
  return String(fileName).slice(index + 1).toLowerCase();
}

function guessMimeTypeFromFileName_(fileName) {
  var extension = getFileExtension_(fileName);
  if (extension === 'csv') {
    return MimeType.CSV;
  }
  if (extension === 'xlsx') {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (extension === 'xls') {
    return 'application/vnd.ms-excel';
  }
  return 'application/octet-stream';
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
    details: error && error.message ? error.message : String(error || '')
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
  var details = error && error.details ? error.details : '';
  var extraErrors = [];
  if (details && (error.code === 'AUTO_CLOSING_LEDGER_BLOCKED')) {
    try {
      extraErrors = JSON.parse(details);
    } catch (ignore) {}
  }
  return {
    ok: false,
    errorCode: error && error.code ? error.code : '',
    userMessage: error && error.userMessage ? error.userMessage : (error && error.message ? error.message : String(error)),
    error: error && error.message ? error.message : String(error),
    errors: extraErrors,
    details: details,
    stack: error && error.stack ? error.stack : ''
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
