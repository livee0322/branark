function parseSheetValues_(sheetData, fileName) {
  var values = sheetData.values;
  var headerInfo = sheetData.headerInfo || detectHeaderRowAndColumns_(values, SOURCE_HEADER_ALIASES, ['productName', 'quantity']);
  var rows = [];
  var warnings = [];
  var errors = [];
  var sheetDate = extractShipmentLedgerDate_(values, fileName);

  if (!headerInfo) {
    errors.push(issue_('SOURCE_HEADER_NOT_FOUND', sheetData.name + ' 시트에서 상품명/수량 헤더를 찾지 못했습니다.', sheetData.name));
    return { rows: rows, warnings: warnings, errors: errors, sourceRowCount: 0 };
  }

  for (var rowIndex = headerInfo.headerRowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    var row = values[rowIndex];
    if (isRowEmpty_(row)) continue;

    var rawProductName = getRowCell_(row, headerInfo.columns.productName);
    var optionName = getRowCell_(row, headerInfo.columns.optionName);
    var quantityText = getRowCell_(row, headerInfo.columns.quantity);
    var orderDateText = getRowCell_(row, headerInfo.columns.orderDate);
    var orderNumber = getRowCell_(row, headerInfo.columns.orderNumber);
    var salesChannel = getRowCell_(row, headerInfo.columns.salesChannel);
    var amountText = getRowCell_(row, headerInfo.columns.amount);

    if (!rawProductName && optionName) rawProductName = optionName;
    if (shouldSkipShipmentLedgerNonDataRow_(sheetData.name, rawProductName, quantityText)) continue;

    if (!rawProductName) {
      errors.push(issue_('PRODUCT_NAME_NOT_FOUND', sheetData.name + ' 시트에서 상품명 값을 읽지 못했습니다.', sheetData.name, rowIndex + 1));
      continue;
    }

    var quantityValue = toNumberStrict_(quantityText);
    if (!isFinite(quantityValue)) {
      if (shouldSkipShipmentLedgerFooterProduct_(sheetData.name, rawProductName)) continue;
      errors.push(issue_('INVALID_QUANTITY', sheetData.name + ' 시트의 수량이 숫자가 아닙니다.', sheetData.name, rowIndex + 1));
      continue;
    }

    var normalized = normalizeProductName_(rawProductName);
    var normalizedOption = normalizeSpecText_(optionName);
    var finalQuantity = quantityValue * normalized.quantityMultiplier;
    var amountValue = toNumberStrict_(amountText);
    var orderDate = orderDateText ? normalizeClosingDateValue_(orderDateText, fileName) : (sheetDate || normalizeOrderDate_('', fileName));

    rows.push({
      sourceSheetName: sheetData.name,
      sourceRowNumber: rowIndex + 1,
      orderDate: orderDate,
      orderNumber: orderNumber,
      salesChannel: salesChannel,
      rawProductName: rawProductName,
      optionName: optionName,
      normalizedProductName: normalized.name,
      compactProductName: normalized.compactName,
      normalizedOptionName: normalizedOption.text,
      compactOptionName: normalizedOption.compactText,
      quantity: finalQuantity,
      amount: isFinite(amountValue) ? amountValue : null
    });
  }

  return { rows: rows, warnings: warnings, errors: errors, sourceRowCount: rows.length, headerRowNumber: headerInfo.headerRowNumber, columns: headerInfo.columns, sheetDate: sheetDate };
}

function shouldSkipShipmentLedgerNonDataRow_(sheetName, rawProductName, quantityText) {
  var product = String(rawProductName || '').trim();
  var quantity = String(quantityText || '').trim();

  if (!product && !quantity) return true;
  if (shouldSkipShipmentLedgerFooterProduct_(sheetName, product)) return true;

  var kind = getClosingLedgerSheetKind_(sheetName);
  if (kind === 'shipment-ledger' && !product && (!quantity || quantity === '0')) return true;

  return false;
}

function shouldSkipShipmentLedgerFooterProduct_(sheetName, productName) {
  if (getClosingLedgerSheetKind_(sheetName) !== 'shipment-ledger') return false;

  var compact = normalizeLooseText_(productName);
  if (!compact) return false;

  if (compact.indexOf('택배발송') === 0) return true;
  if (compact.indexOf('출고확인자') === 0) return true;
  if (compact.indexOf('특이사항') === 0) return true;
  if (compact.indexOf('미출고현황') >= 0) return true;
  if (compact.indexOf('합계') >= 0) return true;
  if (/^ns[A-Za-z0-9-]*/i.test(compact)) return true;

  return false;
}
