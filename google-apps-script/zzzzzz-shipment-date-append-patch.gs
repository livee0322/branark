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
    temporaryFileIds = (parsedResult.temporaryFileIds || []).slice();
    warnings = warnings.concat(parsedResult.warnings || []);
    errors = errors.concat(parsedResult.errors || []);

    var aggregatedResult = aggregateParsedRows_(parsedResult.rows, uploaded.fileName, uploaded.fileId);
    warnings = warnings.concat(aggregatedResult.warnings || []);
    errors = errors.concat(aggregatedResult.errors || []);

    if (!aggregatedResult.rows.length) {
      errors.push({ code: 'NO_NORMALIZED_ROWS', message: '정규화된 결과 행이 0건입니다.' });
    }

    var priceResult = matchPrices_(aggregatedResult.rows, priceSheetId, keepTemporaryFiles);
    temporaryFileIds = temporaryFileIds.concat(priceResult.temporaryFileIds || []);
    warnings = warnings.concat(priceResult.warnings || []);
    errors = errors.concat(priceResult.errors || []);

    var salesAggregate = buildSalesAggregateFromPayload_(payload, uploaded.fileName);
    warnings = warnings.concat(salesAggregate.warnings || []);

    var blockingErrors = collectBlockingErrors_(errors);
    var appendResult = { spreadsheetTitle: '', sheetName: '', startRow: 0, endRow: 0, rowCount: 0 };
    var salesAppendResult = { spreadsheetTitle: '', sheetName: '판매처 집계', startRow: 0, endRow: 0, rowCount: 0 };

    if (blockingErrors.length === 0) {
      appendResult = appendClosingLedgerRows_(dailySheetId, priceResult.rows);
      salesAppendResult = appendSalesAggregateRows_(dailySheetId, salesAggregate.rows, uploaded.fileName, uploaded.fileId);
    } else {
      throw appError_('AUTO_CLOSING_LEDGER_BLOCKED', '검증 오류가 있어 일일마감 반영을 중단했습니다.', JSON.stringify(blockingErrors));
    }

    return {
      callbackId: payload.callbackId || '',
      mode: 'auto-closing-ledger',
      uploadedFile: { fileId: uploaded.fileId, fileName: uploaded.fileName, fileUrl: uploaded.fileUrl, temporarySpreadsheetIds: temporaryFileIds },
      parsed: { sourceSheetNames: parsedResult.sourceSheetNames, sourceRowCount: parsedResult.sourceRowCount, normalizedRowCount: priceResult.rows.length },
      comparison: parsedResult.comparison,
      matched: { matchedCount: priceResult.matchedCount, unmatchedCount: priceResult.unmatchedCount },
      appended: appendResult,
      salesAggregate: { parsedRowCount: salesAggregate.rows.length, appended: salesAppendResult },
      rows: priceResult.rows,
      aggregatedItems: aggregatedResult.aggregatedItems,
      priceMatches: priceResult.priceMatches,
      debug: { parsedSheets: parsedResult.parsedSheets || [], comparison: parsedResult.comparison, price: priceResult.debug || {}, salesAggregate: salesAggregate.debug || {}, uploaded: { fileId: uploaded.fileId, fileName: uploaded.fileName, temporarySpreadsheetIds: temporaryFileIds } },
      warnings: dedupeIssueList_(warnings),
      errors: dedupeIssueList_(errors)
    };
  } finally {
    if (!keepTemporaryFiles) cleanupTemporaryFiles_(temporaryFileIds);
  }
}

function matchPrices_(rows, priceSheetId, keepTemporaryFiles) {
  var priceResource = readPriceResource_(priceSheetId, keepTemporaryFiles);
  var resultRows = [];
  var priceMatches = [];
  var warnings = [];
  var errors = [];
  var matchedCount = 0;
  var unmatchedCount = 0;
  var unmatchedItems = [];

  for (var i = 0; i < rows.length; i += 1) {
    var item = rows[i];
    var matched = findPriceMatch_(item, priceResource);
    if (!matched) {
      unmatchedCount += 1;
      errors.push(issue_('PRICE_NOT_FOUND', '단가표에서 상품명을 찾지 못했습니다: ' + item.normalizedProductName));
      unmatchedItems.push({ productName: item.productName, normalizedProductName: item.normalizedProductName, spec: item.spec || '' });
      priceMatches.push({ orderProductName: item.productName, normalizedOrderProductName: item.normalizedProductName, priceProductName: '', priceSpec: '', quantity: item.quantity, matched: false, matchedBy: '', supplyPrice: null, vat: null, totalPrice: null, status: '확인 필요' });
      continue;
    }

    matchedCount += 1;
    var closingSupplyPrice = calculateClosingSupplyPrice_(matched.record);
    var displayName = getClosingLedgerDisplayName_(item, matched.record);
    var shipmentDate = item.shipmentDate || item.orderDate || '';
    var memo = item.memoBase + ' / 출고일: ' + shipmentDate + ' / 처리 시각: ' + formatNow_();
    if (matched.by === 'supplemental-rule') warnings.push(issue_('SUPPLEMENTAL_PRICE_USED', '공급단가표 보완 규칙을 사용했습니다: ' + displayName + ' / ' + matched.record.spec));

    resultRows.push({ orderDate: item.orderDate, shipmentDate: shipmentDate, productName: item.productName, normalizedProductName: displayName, priceProductName: matched.record.productName, priceSpec: matched.record.spec, quantity: item.quantity, supplyPrice: closingSupplyPrice, totalPrice: item.quantity * closingSupplyPrice, memo: memo, sourceSheetName: item.sourceSheetNames.join(', ') });
    priceMatches.push({ orderProductName: item.productName, normalizedOrderProductName: displayName, priceProductName: matched.record.productName, priceSpec: matched.record.spec, quantity: item.quantity, matched: true, matchedBy: matched.by, basePrice: matched.record.supplyPrice, supplyPrice: closingSupplyPrice, vat: matched.record.vat, totalPrice: item.quantity * closingSupplyPrice, shipmentDate: shipmentDate, status: matched.by === 'product+spec' ? '정상 매칭' : (matched.by === 'supplemental-rule' ? '보완 규칙 매칭' : '상품명 기준 매칭') });
  }

  return { rows: resultRows, priceMatches: priceMatches, matchedCount: matchedCount, unmatchedCount: unmatchedCount, warnings: warnings, errors: errors, temporaryFileIds: priceResource.temporaryFileIds, debug: { priceSheetId: priceResource.id, priceSheetName: priceResource.name, priceSheetType: priceResource.type, priceSheetTabName: priceResource.sheetName, headerRowNumber: priceResource.headerRowNumber, columns: priceResource.columns, temporaryFileIds: priceResource.temporaryFileIds, unmatchedItems: unmatchedItems } };
}

function appendClosingLedgerRows_(dailySheetId, rows) {
  if (!rows.length) throw appError_('NO_APPEND_ROWS', '일일마감에 반영할 결과 행이 0건입니다.');

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
  if (!headerInfo) throw appError_('DAILY_SHEET_HEADER_MISSING', '일일마감 시트 헤더를 찾지 못했습니다.');

  var headerRow = values[headerInfo.headerRowIndex] || [];
  var shipmentDateColumn = findHeaderColumn_(headerRow, ['출고일', '출고일자', '배송일']);
  if (shipmentDateColumn === null) {
    shipmentDateColumn = headerRow.length;
    sheet.getRange(headerInfo.headerRowNumber, shipmentDateColumn + 1).setValue('출고일');
    values = sheet.getDataRange().getDisplayValues();
    headerRow = values[headerInfo.headerRowIndex] || [];
  }

  var headerLength = Math.max(headerRow.length, shipmentDateColumn + 1);
  var sortedRows = rows.slice().sort(function(a, b) {
    var dateA = String(a.shipmentDate || a.orderDate || '');
    var dateB = String(b.shipmentDate || b.orderDate || '');
    if (dateA === dateB) return String(a.normalizedProductName || '').localeCompare(String(b.normalizedProductName || ''), 'ko');
    return dateA > dateB ? 1 : -1;
  });

  var appendRows = [];
  var previousDate = '';
  for (var i = 0; i < sortedRows.length; i += 1) {
    var shipmentDate = sortedRows[i].shipmentDate || sortedRows[i].orderDate || '';
    if (previousDate && shipmentDate && previousDate !== shipmentDate) appendRows.push(new Array(headerLength).fill(''));
    var row = new Array(headerLength);
    for (var columnIndex = 0; columnIndex < headerLength; columnIndex += 1) row[columnIndex] = '';
    row[headerInfo.columns.orderDate] = sortedRows[i].orderDate;
    row[shipmentDateColumn] = shipmentDate;
    row[headerInfo.columns.productName] = sortedRows[i].normalizedProductName;
    row[headerInfo.columns.quantity] = sortedRows[i].quantity;
    row[headerInfo.columns.supplyPrice] = sortedRows[i].supplyPrice;
    row[headerInfo.columns.totalPrice] = sortedRows[i].totalPrice;
    row[headerInfo.columns.memo] = sortedRows[i].memo;
    appendRows.push(row);
    previousDate = shipmentDate || previousDate;
  }

  var startRow = Math.max(sheet.getLastRow() + 1, headerInfo.headerRowNumber + 1);
  var targetRange = sheet.getRange(startRow, 1, appendRows.length, headerLength);
  try {
    targetRange.setValues(appendRows);
  } catch (error) {
    throw appError_('DAILY_SHEET_APPEND_FAILED', '일일마감 시트에 결과 행을 추가하지 못했습니다.', error.message);
  }

  return { spreadsheetTitle: spreadsheet.getName(), sheetName: sheet.getName(), startRow: startRow, endRow: startRow + appendRows.length - 1, rowCount: appendRows.length, dataRowCount: sortedRows.length, blankSeparatorRows: appendRows.length - sortedRows.length, shipmentDateColumn: shipmentDateColumn + 1 };
}

function buildSalesAggregateFromPayload_(payload, fileName) {
  var warnings = [];
  var debug = { source: 'clientWorkbookJson', waybillSheetFound: false, orderColumn: null, productColumn: null, quantityColumn: null };
  if (!payload.clientWorkbookJson) return { rows: [], warnings: [issue_('SALES_AGGREGATE_SKIPPED', '브라우저에서 전달한 엑셀 원본 데이터가 없어 판매처 집계를 생략했습니다.')], debug: debug };

  var workbook;
  try {
    workbook = JSON.parse(String(payload.clientWorkbookJson || '{}'));
  } catch (error) {
    return { rows: [], warnings: [issue_('SALES_AGGREGATE_PARSE_FAILED', '판매처 집계용 엑셀 데이터를 읽지 못했습니다.', '', null)], debug: debug };
  }

  var sheets = workbook.sheets || [];
  var waybillSheet = null;
  for (var i = 0; i < sheets.length; i += 1) {
    if (getClosingLedgerSheetKind_(sheets[i].name) === 'waybill') {
      waybillSheet = { name: sheets[i].name, values: normalizeClientSheetValues_(sheets[i].values || []) };
      break;
    }
  }
  if (!waybillSheet) return { rows: [], warnings: [issue_('SALES_AGGREGATE_WAYBILL_MISSING', '판매처 집계용 운송장 시트를 찾지 못했습니다.')], debug: debug };
  debug.waybillSheetFound = true;

  var headerInfo = detectHeaderRowAndColumns_(waybillSheet.values, SOURCE_HEADER_ALIASES, ['productName']);
  if (!headerInfo) return { rows: [], warnings: [issue_('SALES_AGGREGATE_HEADER_MISSING', '운송장 시트에서 판매처 집계용 헤더를 찾지 못했습니다.', waybillSheet.name)], debug: debug };

  var headerRow = waybillSheet.values[headerInfo.headerRowIndex] || [];
  var orderColumn = findHeaderColumn_(headerRow, ['주문번호', '주문건번호', '주문id', '주문 번호']);
  if (orderColumn === null) orderColumn = 0;
  var productColumn = headerInfo.columns.productName;
  var quantityColumn = headerInfo.columns.quantity;
  debug.orderColumn = orderColumn + 1;
  debug.productColumn = productColumn + 1;
  debug.quantityColumn = quantityColumn === undefined ? null : quantityColumn + 1;

  var orderMap = {};
  for (var rowIndex = headerInfo.headerRowIndex + 1; rowIndex < waybillSheet.values.length; rowIndex += 1) {
    var row = waybillSheet.values[rowIndex];
    if (isRowEmpty_(row)) continue;
    var orderNumber = getRowCell_(row, orderColumn);
    var productName = getRowCell_(row, productColumn);
    if (!orderNumber || !productName) continue;
    var baseQuantity = quantityColumn === undefined ? 1 : toNumberStrict_(getRowCell_(row, quantityColumn));
    if (!isFinite(baseQuantity)) baseQuantity = 1;
    var normalized = normalizeProductName_(productName);
    var actualQuantity = baseQuantity * normalized.quantityMultiplier;
    if (!orderMap[orderNumber]) orderMap[orderNumber] = { orderDate: inferDateFromFileName_(fileName) || '', orderNumber: orderNumber, orderCount: 1, productQuantity: 0, rawProductNames: {}, rowCount: 0 };
    orderMap[orderNumber].productQuantity += actualQuantity;
    orderMap[orderNumber].rawProductNames[productName] = true;
    orderMap[orderNumber].rowCount += 1;
  }

  var rows = [];
  var keys = Object.keys(orderMap).sort();
  for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) rows.push(orderMap[keys[keyIndex]]);
  if (!rows.length) warnings.push(issue_('SALES_AGGREGATE_ORDER_NUMBER_EMPTY', '운송장 A열 주문번호가 비어 있어 판매처 집계를 추가하지 않았습니다.'));
  debug.orderCount = rows.length;
  return { rows: rows, warnings: warnings, debug: debug };
}

function appendSalesAggregateRows_(dailySheetId, rows, fileName, fileId) {
  if (!rows || !rows.length) return { spreadsheetTitle: '', sheetName: '판매처 집계', startRow: 0, endRow: 0, rowCount: 0 };

  var spreadsheet = SpreadsheetApp.openById(dailySheetId);
  var sheet = spreadsheet.getSheetByName('판매처 집계');
  if (!sheet) sheet = spreadsheet.insertSheet('판매처 집계');

  var requiredHeaders = ['주문일', '주문번호', '주문건수', '상품수량', '비고'];
  var values = sheet.getDataRange().getDisplayValues();
  var headerInfo = findSalesAggregateHeader_(values);
  if (!headerInfo) {
    var headerRowNumber = Math.max(sheet.getLastRow() + 1, 1);
    if (sheet.getLastRow() > 0) headerRowNumber += 1;
    sheet.getRange(headerRowNumber, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    headerInfo = { headerRowNumber: headerRowNumber, columns: { orderDate: 0, orderNumber: 1, orderCount: 2, productQuantity: 3, memo: 4 } };
  }

  var width = Math.max(5, sheet.getLastColumn(), headerInfo.columns.memo + 1);
  var appendRows = [];
  for (var i = 0; i < rows.length; i += 1) {
    var row = new Array(width).fill('');
    row[headerInfo.columns.orderDate] = rows[i].orderDate;
    row[headerInfo.columns.orderNumber] = rows[i].orderNumber;
    row[headerInfo.columns.orderCount] = rows[i].orderCount;
    row[headerInfo.columns.productQuantity] = rows[i].productQuantity;
    row[headerInfo.columns.memo] = '원본 파일명: ' + fileName + ' / Drive file ID: ' + fileId + ' / 원본 운송장 행수: ' + rows[i].rowCount + ' / 처리 시각: ' + formatNow_();
    appendRows.push(row);
  }

  var startRow = Math.max(sheet.getLastRow() + 1, headerInfo.headerRowNumber + 1);
  sheet.getRange(startRow, 1, appendRows.length, width).setValues(appendRows);
  return { spreadsheetTitle: spreadsheet.getName(), sheetName: sheet.getName(), startRow: startRow, endRow: startRow + appendRows.length - 1, rowCount: appendRows.length };
}

function findSalesAggregateHeader_(values) {
  for (var rowIndex = 0; rowIndex < Math.min(values.length, 30); rowIndex += 1) {
    var row = values[rowIndex] || [];
    var columns = {
      orderDate: findHeaderColumn_(row, ['주문일', '주문일자', '발주일']),
      orderNumber: findHeaderColumn_(row, ['주문번호', '주문건번호', '주문id']),
      orderCount: findHeaderColumn_(row, ['주문건수', '주문수', '건수']),
      productQuantity: findHeaderColumn_(row, ['상품수량', '수량', '총수량']),
      memo: findHeaderColumn_(row, ['비고', '메모'])
    };
    if (columns.orderDate !== null && columns.orderNumber !== null && columns.orderCount !== null && columns.productQuantity !== null && columns.memo !== null) {
      return { headerRowNumber: rowIndex + 1, columns: columns };
    }
  }
  return null;
}
