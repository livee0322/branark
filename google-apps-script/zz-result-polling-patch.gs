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
