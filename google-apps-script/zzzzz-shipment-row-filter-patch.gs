function inspectSourceSheetCandidate_(sheetName, values, forceInclude) {
  var kind = getClosingLedgerSheetKind_(sheetName);
  var required = kind === 'waybill' ? ['productName'] : ['productName', 'quantity'];
  var headerInfo = detectHeaderRowAndColumns_(values, SOURCE_HEADER_ALIASES, required);
  if (!headerInfo && !forceInclude) return null;
  if (!headerInfo && forceInclude) return null;
  var score = headerInfo.score;
  if (kind === 'waybill') score += 60;
  if (kind === 'shipment-ledger') score += 50;
  return { name: sheetName, values: values, headerInfo: headerInfo, score: score };
}

function parseSheetValues_(sheetData, fileName) {
  var values = sheetData.values;
  var sheetKind = getClosingLedgerSheetKind_(sheetData.name);
  var required = sheetKind === 'waybill' ? ['productName'] : ['productName', 'quantity'];
  var headerInfo = sheetData.headerInfo || detectHeaderRowAndColumns_(values, SOURCE_HEADER_ALIASES, required);
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
    var quantityText = headerInfo.columns.quantity === undefined ? '1' : getRowCell_(row, headerInfo.columns.quantity);
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

function buildSheetComparison_(primarySheets, validationSheets) {
  var primaryRows = flattenParsedSheetRows_(primarySheets);
  var validationRows = flattenParsedSheetRows_(validationSheets);
  var primaryGroups = buildLenientQuantityGroups_(primaryRows);
  var validationGroups = buildLenientQuantityGroups_(validationRows);
  var differences = [];
  var matchedValidationIndexes = {};

  for (var i = 0; i < primaryGroups.length; i += 1) {
    var primaryGroup = primaryGroups[i];
    var matchedValidation = findLenientGroupMatch_(validationGroups, primaryGroup.signatures);
    var validationQuantity = matchedValidation ? matchedValidation.quantity : 0;
    if (matchedValidation) matchedValidationIndexes[matchedValidation.index] = true;
    if (primaryGroup.quantity !== validationQuantity) {
      differences.push({ key: primaryGroup.key, productName: primaryGroup.productName, primaryQuantity: primaryGroup.quantity, validationQuantity: validationQuantity, validationProductName: matchedValidation ? matchedValidation.productName : '', rule: '운송장 상품명과 출고일지 상품명을 띄어쓰기/괄호/중국완제/KG/_숫자 기준으로 보정 비교' });
    }
  }

  for (var j = 0; j < validationGroups.length; j += 1) {
    if (matchedValidationIndexes[j]) continue;
    var validationGroup = validationGroups[j];
    var matchedPrimary = findLenientGroupMatch_(primaryGroups, validationGroup.signatures);
    if (matchedPrimary) continue;
    differences.push({ key: validationGroup.key, productName: validationGroup.productName, primaryQuantity: 0, validationQuantity: validationGroup.quantity, validationProductName: validationGroup.productName, rule: '출고일지에는 있으나 운송장에서 매칭되는 상품명을 찾지 못함' });
  }

  return { primarySheet: primarySheets.map(function(item) { return item.sheetName; }).join(', '), validationSheets: validationSheets.map(function(item) { return item.sheetName; }), primaryQuantityTotal: sumRowQuantity_(primaryRows), validationQuantityTotal: sumRowQuantity_(validationRows), quantityMatched: validationSheets.length ? differences.length === 0 : true, comparisonPerformed: validationSheets.length > 0, validationRule: '운송장 상품명 컬럼의 _숫자 배수를 출고일지/출고일지(2)의 상품명·수량 합계와 유연 비교합니다.', differences: differences };
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

function buildLenientQuantityGroups_(rows) {
  var groups = [];
  for (var i = 0; i < rows.length; i += 1) {
    var row = rows[i];
    var signatures = buildLenientProductSignaturesFromRow_(row);
    if (!signatures.length) continue;
    var existing = findLenientGroupMatch_(groups, signatures);
    if (existing) {
      existing.quantity += Number(row.quantity || 0);
      existing.rawProductNames[row.rawProductName || row.normalizedProductName || ''] = true;
      existing.signatures = mergeUnique_(existing.signatures, signatures);
      continue;
    }
    var productName = row.rawProductName || row.normalizedProductName || '';
    var rawProductNames = {};
    rawProductNames[productName] = true;
    groups.push({ index: groups.length, key: signatures[0], signatures: signatures, productName: productName, quantity: Number(row.quantity || 0), rawProductNames: rawProductNames });
  }
  return groups;
}

function findLenientGroupMatch_(groups, signatures) {
  var signatureIndex = {};
  for (var i = 0; i < signatures.length; i += 1) signatureIndex[signatures[i]] = true;
  for (var groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    var group = groups[groupIndex];
    for (var sigIndex = 0; sigIndex < group.signatures.length; sigIndex += 1) {
      if (signatureIndex[group.signatures[sigIndex]]) {
        group.index = groupIndex;
        return group;
      }
    }
  }
  return null;
}

function buildLenientProductSignaturesFromRow_(row) {
  var values = [row.normalizedProductName, row.rawProductName, row.optionName, row.normalizedOptionName];
  var signatures = [];
  for (var i = 0; i < values.length; i += 1) {
    var value = String(values[i] || '').trim();
    if (!value) continue;
    var normalized = normalizeProductName_(value).name;
    var expanded = expandLenientProductNames_(normalized);
    for (var itemIndex = 0; itemIndex < expanded.length; itemIndex += 1) {
      var signature = normalizeLooseText_(expanded[itemIndex]);
      if (signature && signatures.indexOf(signature) < 0) signatures.push(signature);
    }
  }
  return signatures;
}

function expandLenientProductNames_(value) {
  var base = String(value || '').trim();
  var names = expandProductAliasNames_(base);
  names.push(base);
  var additions = [];
  for (var i = 0; i < names.length; i += 1) {
    var name = names[i];
    additions.push(name);
    additions.push(name.replace(/중국완제/g, ''));
    additions.push(name.replace(/맛집밥상/g, ''));
    additions.push(name.replace(/\bkg\b/ig, 'kg'));
    additions.push(name.replace(/\s+/g, ''));
  }
  return mergeUnique_([], additions);
}

function mergeUnique_(base, additions) {
  var result = base ? base.slice() : [];
  for (var i = 0; i < additions.length; i += 1) {
    if (additions[i] && result.indexOf(additions[i]) < 0) result.push(additions[i]);
  }
  return result;
}
