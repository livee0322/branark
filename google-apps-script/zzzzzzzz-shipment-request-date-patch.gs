function extractShipmentLedgerDate_(values, fileName) {
  var labelAliases = ['출고요청일', '출고 요청일', '출고일', '출고일자', '배송요청일'];

  for (var rowIndex = 0; rowIndex < Math.min(values.length, 10); rowIndex += 1) {
    var row = values[rowIndex] || [];
    for (var colIndex = 0; colIndex < row.length; colIndex += 1) {
      var cellText = normalizeHeaderText_(row[colIndex]);
      var matchedLabel = false;
      for (var aliasIndex = 0; aliasIndex < labelAliases.length; aliasIndex += 1) {
        if (cellText === normalizeHeaderText_(labelAliases[aliasIndex])) {
          matchedLabel = true;
          break;
        }
      }
      if (!matchedLabel) continue;

      for (var nextCol = colIndex + 1; nextCol < row.length; nextCol += 1) {
        var candidate = normalizeClosingDateValue_(row[nextCol], fileName);
        if (candidate) return candidate;
      }
    }
  }

  return '';
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
    var shipmentRequestDate = item.shipmentRequestDate || item.shipmentDate || item.orderDate || '';
    var memo = item.memoBase + ' / 출고요청일: ' + shipmentRequestDate + ' / 처리 시각: ' + formatNow_();
    if (matched.by === 'supplemental-rule') warnings.push(issue_('SUPPLEMENTAL_PRICE_USED', '공급단가표 보완 규칙을 사용했습니다: ' + displayName + ' / ' + matched.record.spec));

    resultRows.push({
      orderDate: item.orderDate,
      shipmentRequestDate: shipmentRequestDate,
      shipmentDate: shipmentRequestDate,
      productName: item.productName,
      normalizedProductName: displayName,
      priceProductName: matched.record.productName,
      priceSpec: matched.record.spec,
      quantity: item.quantity,
      supplyPrice: closingSupplyPrice,
      totalPrice: item.quantity * closingSupplyPrice,
      memo: memo,
      sourceSheetName: item.sourceSheetNames.join(', ')
    });
    priceMatches.push({ orderProductName: item.productName, normalizedOrderProductName: displayName, priceProductName: matched.record.productName, priceSpec: matched.record.spec, quantity: item.quantity, matched: true, matchedBy: matched.by, basePrice: matched.record.supplyPrice, supplyPrice: closingSupplyPrice, vat: matched.record.vat, totalPrice: item.quantity * closingSupplyPrice, shipmentRequestDate: shipmentRequestDate, status: matched.by === 'product+spec' ? '정상 매칭' : (matched.by === 'supplemental-rule' ? '보완 규칙 매칭' : '상품명 기준 매칭') });
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
  var shipmentRequestDateColumn = findHeaderColumn_(headerRow, ['출고요청일', '출고 요청일', '출고일', '출고일자', '배송일']);
  if (shipmentRequestDateColumn === null) {
    shipmentRequestDateColumn = headerRow.length;
    sheet.getRange(headerInfo.headerRowNumber, shipmentRequestDateColumn + 1).setValue('출고요청일');
    values = sheet.getDataRange().getDisplayValues();
    headerRow = values[headerInfo.headerRowIndex] || [];
  } else {
    var currentHeader = String(headerRow[shipmentRequestDateColumn] || '').trim();
    if (normalizeHeaderText_(currentHeader) === normalizeHeaderText_('출고일')) {
      sheet.getRange(headerInfo.headerRowNumber, shipmentRequestDateColumn + 1).setValue('출고요청일');
    }
  }

  var headerLength = Math.max(headerRow.length, shipmentRequestDateColumn + 1);
  var sortedRows = rows.slice().sort(function(a, b) {
    var dateA = String(a.shipmentRequestDate || a.shipmentDate || a.orderDate || '');
    var dateB = String(b.shipmentRequestDate || b.shipmentDate || b.orderDate || '');
    if (dateA === dateB) return String(a.normalizedProductName || '').localeCompare(String(b.normalizedProductName || ''), 'ko');
    return dateA > dateB ? 1 : -1;
  });

  var appendRows = [];
  var previousDate = '';
  for (var i = 0; i < sortedRows.length; i += 1) {
    var shipmentRequestDate = sortedRows[i].shipmentRequestDate || sortedRows[i].shipmentDate || sortedRows[i].orderDate || '';
    if (previousDate && shipmentRequestDate && previousDate !== shipmentRequestDate) appendRows.push(new Array(headerLength).fill(''));

    var row = new Array(headerLength);
    for (var columnIndex = 0; columnIndex < headerLength; columnIndex += 1) row[columnIndex] = '';

    row[headerInfo.columns.orderDate] = sortedRows[i].orderDate;
    row[shipmentRequestDateColumn] = shipmentRequestDate;
    row[headerInfo.columns.productName] = sortedRows[i].normalizedProductName;
    row[headerInfo.columns.quantity] = sortedRows[i].quantity;
    row[headerInfo.columns.supplyPrice] = sortedRows[i].supplyPrice;
    row[headerInfo.columns.totalPrice] = sortedRows[i].totalPrice;
    row[headerInfo.columns.memo] = sortedRows[i].memo;
    appendRows.push(row);
    previousDate = shipmentRequestDate || previousDate;
  }

  var startRow = Math.max(sheet.getLastRow() + 1, headerInfo.headerRowNumber + 1);
  var targetRange = sheet.getRange(startRow, 1, appendRows.length, headerLength);
  try {
    targetRange.setValues(appendRows);
  } catch (error) {
    throw appError_('DAILY_SHEET_APPEND_FAILED', '일일마감 시트에 결과 행을 추가하지 못했습니다.', error.message);
  }

  return { spreadsheetTitle: spreadsheet.getName(), sheetName: sheet.getName(), startRow: startRow, endRow: startRow + appendRows.length - 1, rowCount: appendRows.length, dataRowCount: sortedRows.length, blankSeparatorRows: appendRows.length - sortedRows.length, shipmentRequestDateColumn: shipmentRequestDateColumn + 1 };
}
