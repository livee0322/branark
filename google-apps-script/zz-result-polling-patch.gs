var BRANARK_RESULT_CACHE_PREFIX = 'branarkClosingLedgerResult:';
var BRANARK_RESULT_CACHE_SECONDS = 21600;
var BRANARK_RESULT_CACHE_MAX_CHARS = 90000;

function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  try {
    if (params.action === 'health') {
      return jsonOutput_(runHealthCheck_(), params.callback);
    }
    if (params.action === 'result') {
      return jsonOutput_(getStoredProcessResult_(params.callbackId || params.jobId || ''), params.callback);
    }
    if (params.action === 'process') {
      var props = PropertiesService.getScriptProperties();
      var processResult = handlePayload_(params, props);
      processResult.ok = true;
      storeProcessResult_(params.callbackId || params.jobId || '', processResult);
      return jsonOutput_(processResult, params.callback);
    }
    return jsonOutput_({
      ok: true,
      service: 'branark-closing-ledger-webapp',
      message: 'Branark closing ledger Apps Script Web App is running.'
    }, params.callback);
  } catch (error) {
    var response = buildErrorResponse_(error);
    storeProcessResult_(params.callbackId || params.jobId || '', response);
    return jsonOutput_(response, params.callback);
  }
}

function doPost(e) {
  var payload = {};
  try {
    payload = parsePayload_(e);
    var props = PropertiesService.getScriptProperties();
    var result = handlePayload_(payload, props);
    result.ok = true;
    result.callbackId = payload.callbackId || result.callbackId || '';
    result.jobId = payload.callbackId || result.jobId || '';
    storeProcessResult_(payload.callbackId || payload.jobId || '', result);
    if (payload.responseMode === 'postMessage') {
      return postMessageOutput_(result, payload.callbackId, payload.pageOrigin);
    }
    return jsonOutput_(result);
  } catch (error) {
    var response = buildErrorResponse_(error);
    response.callbackId = payload.callbackId || '';
    response.jobId = payload.callbackId || payload.jobId || '';
    storeProcessResult_(payload.callbackId || payload.jobId || '', response);
    if (payload.responseMode === 'postMessage') {
      return postMessageOutput_(response, payload.callbackId, payload.pageOrigin);
    }
    return jsonOutput_(response);
  }
}

function parseOrderFile_(uploaded, payload, keepTemporaryFiles) {
  var fileName = uploaded.fileName;
  var extension = getFileExtension_(fileName);
  if (payload.clientWorkbookJson) {
    return parseClientWorkbookAsRows_(payload.clientWorkbookJson, fileName);
  }
  if (extension === 'csv') {
    return parseCsvContentAsRows_(uploaded.sampleCsvContent || uploaded.blob.getDataAsString('UTF-8'), fileName);
  }
  if (extension === 'xlsx' || extension === 'xls') {
    return parseSpreadsheetBlobAsRows_(uploaded.blob, fileName, keepTemporaryFiles);
  }
  throw appError_('UNSUPPORTED_FILE_TYPE', '지원하지 않는 파일 형식입니다. csv, xlsx, xls 파일만 처리할 수 있습니다.');
}

function parseClientWorkbookAsRows_(clientWorkbookJson, fileName) {
  var workbook;
  try {
    workbook = JSON.parse(String(clientWorkbookJson || '{}'));
  } catch (error) {
    throw appError_('CLIENT_WORKBOOK_PARSE_FAILED', '브라우저에서 전달한 엑셀 데이터를 읽지 못했습니다.', error.message);
  }

  var sourceSheets = workbook.sheets || [];
  var candidateSheets = [];
  var sheetNameIndex = {};
  var warnings = [];
  var errors = [];

  for (var i = 0; i < sourceSheets.length; i += 1) {
    var sheetName = String(sourceSheets[i].name || 'Sheet' + (i + 1));
    var values = normalizeClientSheetValues_(sourceSheets[i].values || []);
    if (isValuesEmpty_(values)) {
      continue;
    }
    var candidate = inspectSourceSheetCandidate_(sheetName, values);
    if (candidate) {
      candidateSheets.push(candidate);
      sheetNameIndex[candidate.name] = true;
    }
  }

  for (var priorityIndex = 0; priorityIndex < SOURCE_SHEET_PRIORITY.length; priorityIndex += 1) {
    var priorityName = SOURCE_SHEET_PRIORITY[priorityIndex];
    for (var sheetIndex = 0; sheetIndex < sourceSheets.length; sheetIndex += 1) {
      var sourceSheet = sourceSheets[sheetIndex];
      if (String(sourceSheet.name || '') === priorityName && !sheetNameIndex[priorityName]) {
        var priorityValues = normalizeClientSheetValues_(sourceSheet.values || []);
        if (!isValuesEmpty_(priorityValues)) {
          var forcedCandidate = inspectSourceSheetCandidate_(priorityName, priorityValues, true);
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

  var parsedSheets = [];
  for (var parseIndex = 0; parseIndex < uniqueCandidates.length; parseIndex += 1) {
    var parsedSheet = parseSheetValues_(uniqueCandidates[parseIndex], fileName);
    parsedSheet.sheetName = uniqueCandidates[parseIndex].name;
    parsedSheets.push(parsedSheet);
    warnings = warnings.concat(parsedSheet.warnings);
    errors = errors.concat(parsedSheet.errors);
  }

  var selected = selectPrimaryAndValidationSheets_(parsedSheets);
  var primaryRows = flattenParsedSheetRows_(selected.primarySheets);
  var comparison = buildSheetComparison_(selected.primarySheets, selected.validationSheets);

  if (selected.validationSheets.length && !comparison.quantityMatched) {
    errors.push(issue_('QUANTITY_COMPARISON_MISMATCH', '운송장 기준 수량과 출고일지 합산 수량이 일치하지 않아 반영을 중단했습니다.'));
  }

  return {
    rows: primaryRows,
    warnings: warnings,
    errors: errors,
    sourceRowCount: primaryRows.length,
    sourceSheetNames: uniqueCandidates.map(function(candidate) { return candidate.name; }),
    parsedSheets: parsedSheets.map(function(item) { return buildParsedSheetDebug_(item.sheetName, item); }),
    comparison: comparison,
    temporaryFileIds: [],
    clientParsed: true
  };
}

function normalizeClientSheetValues_(values) {
  var normalized = [];
  for (var rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
    var row = values[rowIndex] || [];
    var normalizedRow = [];
    for (var colIndex = 0; colIndex < row.length; colIndex += 1) {
      normalizedRow.push(row[colIndex] === null || row[colIndex] === undefined ? '' : String(row[colIndex]));
    }
    normalized.push(normalizedRow);
  }
  return normalized;
}

function getStoredProcessResult_(callbackId) {
  var normalizedCallbackId = sanitizeResultCallbackId_(callbackId);
  if (!normalizedCallbackId) {
    return {
      ok: false,
      errorCode: 'MISSING_CALLBACK_ID',
      userMessage: '결과 조회용 callbackId가 없습니다.',
      pending: false
    };
  }
  var raw = CacheService.getScriptCache().get(BRANARK_RESULT_CACHE_PREFIX + normalizedCallbackId);
  if (!raw) {
    return {
      ok: true,
      pending: true,
      callbackId: normalizedCallbackId,
      userMessage: '처리 결과를 기다리고 있습니다.'
    };
  }
  try {
    var result = JSON.parse(raw);
    result.pending = false;
    return result;
  } catch (error) {
    return {
      ok: false,
      pending: false,
      callbackId: normalizedCallbackId,
      errorCode: 'RESULT_CACHE_PARSE_FAILED',
      userMessage: '저장된 처리 결과를 읽지 못했습니다.',
      details: error.message
    };
  }
}

function storeProcessResult_(callbackId, result) {
  var normalizedCallbackId = sanitizeResultCallbackId_(callbackId);
  if (!normalizedCallbackId || !result) return;
  var payload = result;
  var raw = JSON.stringify(payload);
  if (raw.length > BRANARK_RESULT_CACHE_MAX_CHARS) {
    payload = compactProcessResultForCache_(result);
    raw = JSON.stringify(payload);
  }
  try {
    CacheService.getScriptCache().put(BRANARK_RESULT_CACHE_PREFIX + normalizedCallbackId, raw, BRANARK_RESULT_CACHE_SECONDS);
  } catch (error) {}
}

function compactProcessResultForCache_(result) {
  var compact = {
    ok: result.ok,
    callbackId: result.callbackId || '',
    jobId: result.jobId || result.callbackId || '',
    mode: result.mode || '',
    uploadedFile: result.uploadedFile || null,
    parsed: result.parsed || null,
    comparison: result.comparison || null,
    matched: result.matched || null,
    appended: result.appended || null,
    warnings: truncateArray_(result.warnings || [], 50),
    errors: truncateArray_(result.errors || [], 50),
    aggregatedItems: truncateArray_(result.aggregatedItems || [], 200),
    priceMatches: truncateArray_(result.priceMatches || [], 200),
    rows: truncateArray_(result.rows || [], 200),
    debug: result.debug ? {
      parsedSheets: truncateArray_(result.debug.parsedSheets || [], 20),
      temporaryFileIds: result.debug.temporaryFileIds || []
    } : {},
    compacted: true,
    compactMessage: '결과가 커서 화면 표시용 주요 항목만 저장했습니다.'
  };
  if (result.errorCode || result.userMessage || result.error || result.details || result.stack) {
    compact.errorCode = result.errorCode || '';
    compact.userMessage = result.userMessage || '';
    compact.error = result.error || '';
    compact.details = result.details || '';
    compact.stack = result.stack || '';
  }
  return compact;
}

function truncateArray_(items, limit) {
  if (!items || !items.length) return [];
  return items.slice(0, limit);
}

function sanitizeResultCallbackId_(callbackId) {
  var value = String(callbackId || '').trim();
  if (!value) return '';
  if (!/^[A-Za-z0-9_.:-]{1,120}$/.test(value)) return '';
  return value;
}
