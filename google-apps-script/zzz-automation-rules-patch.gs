var BRANARK_SUPPLEMENTAL_PRICE_RULES = [
  { aliases: ['아삭아삭궁채장아찌1kg'], productName: '아삭아삭 궁채장아찌', spec: '1kg', supplyPrice: 2200, vat: 0, closingSupplyPrice: 2200 },
  { aliases: ['아삭아삭궁채장아찌4kg'], productName: '아삭아삭 궁채장아찌', spec: '4kg', supplyPrice: 8800, vat: 0, closingSupplyPrice: 8800 },
  { aliases: ['아삭알마늘1kg', '중국완제아삭알마늘1kg'], productName: '아삭알마늘(중국완제)', spec: '1kg', supplyPrice: 3088, vat: 0, closingSupplyPrice: 3088 },
  { aliases: ['맛집밥상양념깻잎1kg', '양념깻잎1kg'], productName: '맛집밥상 양념깻잎', spec: '1kg', supplyPrice: 5929, vat: 0, closingSupplyPrice: 5929 },
  { aliases: ['맛집밥상오복지4kg', '오복지4kg'], productName: '맛집밥상 오복지', spec: '4kg', supplyPrice: 9801, vat: 0, closingSupplyPrice: 9801 },
  { aliases: ['맛집밥상전통고추잎무침1kg', '전통고추잎무침1kg'], productName: '맛집밥상 전통고추잎무침', spec: '1kg', supplyPrice: 4200, vat: 420, closingSupplyPrice: 4620 },
  { aliases: ['택배발송'], productName: '택배발송', spec: '1건', supplyPrice: 4000, vat: 0, closingSupplyPrice: 4000 }
];

function parseClientWorkbookAsRows_(clientWorkbookJson, fileName) {
  var workbook;
  try {
    workbook = JSON.parse(String(clientWorkbookJson || '{}'));
  } catch (error) {
    throw appError_('CLIENT_WORKBOOK_PARSE_FAILED', '브라우저에서 전달한 엑셀 데이터를 읽지 못했습니다.', error.message);
  }

  var sourceSheets = workbook.sheets || [];
  var candidateSheets = [];
  var warnings = [];
  var errors = [];

  for (var i = 0; i < sourceSheets.length; i += 1) {
    var sheetName = String(sourceSheets[i].name || 'Sheet' + (i + 1));
    var values = normalizeClientSheetValues_(sourceSheets[i].values || []);
    if (isValuesEmpty_(values)) continue;
    var candidate = inspectSourceSheetCandidate_(sheetName, values);
    if (candidate) candidateSheets.push(candidate);
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
    parsedSheet.sheetKind = getClosingLedgerSheetKind_(uniqueCandidates[parseIndex].name);
    parsedSheets.push(parsedSheet);
    warnings = warnings.concat(parsedSheet.warnings || []);
    errors = errors.concat(parsedSheet.errors || []);
  }

  var selected = selectPrimaryAndValidationSheets_(parsedSheets);
  var primaryRows = flattenParsedSheetRows_(selected.primarySheets);
  var comparison = buildSheetComparison_(selected.primarySheets, selected.validationSheets);

  if (selected.primaryMode === 'waybill' && selected.validationSheets.length && !comparison.quantityMatched) {
    errors.push(issue_('QUANTITY_COMPARISON_MISMATCH', '운송장 기준 수량과 출고일지 합산 수량이 일치하지 않아 반영을 중단했습니다.'));
  }

  if (selected.primaryMode === 'shipment-ledger') {
    var shippingRows = buildShippingRowsFromWaybill_(selected.primarySheets, uniqueCandidates);
    primaryRows = primaryRows.concat(shippingRows.rows);
    warnings = warnings.concat(shippingRows.warnings);
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
    clientParsed: true,
    primaryMode: selected.primaryMode
  };
}

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

function selectPrimaryAndValidationSheets_(parsedSheets) {
  var waybillSheets = [];
  var shipmentSheets = [];
  var otherSheets = [];
  for (var i = 0; i < parsedSheets.length; i += 1) {
    var kind = getClosingLedgerSheetKind_(parsedSheets[i].sheetName);
    if (kind === 'waybill') waybillSheets.push(parsedSheets[i]);
    else if (kind === 'shipment-ledger') shipmentSheets.push(parsedSheets[i]);
    else otherSheets.push(parsedSheets[i]);
  }
  if (shipmentSheets.length) {
    shipmentSheets.sort(function(a, b) { return a.sheetName > b.sheetName ? 1 : -1; });
    return { primarySheets: shipmentSheets, validationSheets: waybillSheets, primaryMode: 'shipment-ledger' };
  }
  if (waybillSheets.length) return { primarySheets: [waybillSheets[0]], validationSheets: otherSheets, primaryMode: 'waybill' };
  return { primarySheets: parsedSheets.slice(0, 1), validationSheets: parsedSheets.slice(1), primaryMode: 'fallback' };
}

function buildShippingRowsFromWaybill_(shipmentSheets, candidateSheets) {
  var warnings = [];
  var waybillCandidate = null;
  for (var i = 0; i < candidateSheets.length; i += 1) {
    if (getClosingLedgerSheetKind_(candidateSheets[i].name) === 'waybill') {
      waybillCandidate = candidateSheets[i];
      break;
    }
  }
  if (!waybillCandidate) return { rows: [], warnings: [issue_('WAYBILL_SHEET_NOT_FOUND_FOR_SHIPPING', '택배발송 수량 계산용 운송장 시트를 찾지 못했습니다.')] };

  var waybillRows = extractWaybillProductRows_(waybillCandidate);
  if (!waybillRows.length) return { rows: [], warnings: [issue_('WAYBILL_ROWS_NOT_FOUND_FOR_SHIPPING', '운송장번호가 있는 운송장 행을 찾지 못했습니다.')] };

  var shippingRows = [];
  for (var sheetIndex = 0; sheetIndex < shipmentSheets.length; sheetIndex += 1) {
    var shipment = shipmentSheets[sheetIndex];
    var productSet = {};
    var orderDate = '';
    for (var rowIndex = 0; rowIndex < shipment.rows.length; rowIndex += 1) {
      var row = shipment.rows[rowIndex];
      if (!orderDate && row.orderDate) orderDate = row.orderDate;
      productSet[normalizeLooseText_(row.normalizedProductName || row.rawProductName)] = true;
    }
    var waybillSet = {};
    for (var waybillIndex = 0; waybillIndex < waybillRows.length; waybillIndex += 1) {
      var waybillRow = waybillRows[waybillIndex];
      if (productSet[waybillRow.compactProductName]) waybillSet[waybillRow.waybillNumber] = true;
    }
    var count = Object.keys(waybillSet).length;
    if (count > 0) {
      shippingRows.push({ sourceSheetName: shipment.sheetName, sourceRowNumber: null, orderDate: orderDate || normalizeOrderDate_('', ''), orderNumber: '', salesChannel: '', rawProductName: '택배발송', optionName: '', normalizedProductName: '택배발송', compactProductName: normalizeLooseText_('택배발송'), normalizedOptionName: '', compactOptionName: '', quantity: count, amount: null });
    } else {
      warnings.push(issue_('SHIPPING_COUNT_EMPTY', shipment.sheetName + ' 기준 택배발송 수량을 계산하지 못했습니다.'));
    }
  }
  return { rows: shippingRows, warnings: warnings };
}

function extractWaybillProductRows_(candidate) {
  var values = candidate.values || [];
  var headerInfo = candidate.headerInfo || detectHeaderRowAndColumns_(values, SOURCE_HEADER_ALIASES, ['productName', 'quantity']);
  if (!headerInfo) return [];
  var waybillColumn = findHeaderColumn_(values[headerInfo.headerRowIndex], ['운송장번호', '송장번호', '운송장']);
  if (waybillColumn === null) return [];
  var rows = [];
  for (var rowIndex = headerInfo.headerRowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    var row = values[rowIndex];
    if (isRowEmpty_(row)) continue;
    var rawProductName = getRowCell_(row, headerInfo.columns.productName);
    var waybillNumber = getRowCell_(row, waybillColumn);
    if (!rawProductName || !waybillNumber) continue;
    var normalized = normalizeProductName_(rawProductName);
    rows.push({ rawProductName: rawProductName, normalizedProductName: normalized.name, compactProductName: normalizeLooseText_(normalized.name), waybillNumber: waybillNumber });
  }
  return rows;
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
    var memo = item.memoBase + ' / 처리 시각: ' + formatNow_();
    if (matched.by === 'supplemental-rule') warnings.push(issue_('SUPPLEMENTAL_PRICE_USED', '공급단가표 보완 규칙을 사용했습니다: ' + displayName + ' / ' + matched.record.spec));
    resultRows.push({ orderDate: item.orderDate, productName: item.productName, normalizedProductName: displayName, priceProductName: matched.record.productName, priceSpec: matched.record.spec, quantity: item.quantity, supplyPrice: closingSupplyPrice, totalPrice: item.quantity * closingSupplyPrice, memo: memo, sourceSheetName: item.sourceSheetNames.join(', ') });
    priceMatches.push({ orderProductName: item.productName, normalizedOrderProductName: displayName, priceProductName: matched.record.productName, priceSpec: matched.record.spec, quantity: item.quantity, matched: true, matchedBy: matched.by, basePrice: matched.record.supplyPrice, supplyPrice: closingSupplyPrice, vat: matched.record.vat, totalPrice: item.quantity * closingSupplyPrice, status: matched.by === 'product+spec' ? '정상 매칭' : (matched.by === 'supplemental-rule' ? '보완 규칙 매칭' : '상품명 기준 매칭') });
  }
  return { rows: resultRows, priceMatches: priceMatches, matchedCount: matchedCount, unmatchedCount: unmatchedCount, warnings: warnings, errors: errors, temporaryFileIds: priceResource.temporaryFileIds, debug: { priceSheetId: priceResource.id, priceSheetName: priceResource.name, priceSheetType: priceResource.type, priceSheetTabName: priceResource.sheetName, headerRowNumber: priceResource.headerRowNumber, columns: priceResource.columns, temporaryFileIds: priceResource.temporaryFileIds, unmatchedItems: unmatchedItems } };
}

function findPriceMatch_(item, priceResource) {
  var productSpecCandidates = buildProductMatchSignatures_(item.productName, item.spec || '').concat(buildProductMatchSignatures_(item.normalizedProductName, item.normalizedSpec || ''));
  for (var i = 0; i < productSpecCandidates.length; i += 1) {
    var combinedRecord = priceResource.combinedMap[productSpecCandidates[i]];
    if (combinedRecord) return { record: combinedRecord, by: 'product+spec' };
  }
  var productOnlyCandidates = buildProductMatchSignatures_(item.productName, '').concat(buildProductMatchSignatures_(item.normalizedProductName, ''));
  for (var j = 0; j < productOnlyCandidates.length; j += 1) {
    var productRecord = priceResource.productMap[productOnlyCandidates[j]];
    if (productRecord) return { record: productRecord, by: 'product-only' };
  }
  var supplemental = findSupplementalPriceRule_(item);
  if (supplemental) return { record: supplemental, by: 'supplemental-rule' };
  return null;
}

function buildProductMatchSignatures_(productName, spec) {
  var signatures = [];
  var expandedNames = expandProductAliasNames_(productName);
  for (var nameIndex = 0; nameIndex < expandedNames.length; nameIndex += 1) {
    var name = expandedNames[nameIndex];
    var candidates = [[name, spec].join(' ').trim(), name, [stripBracketText_(name), spec].join(' ').trim(), stripBracketText_(name)];
    for (var i = 0; i < candidates.length; i += 1) {
      var signature = normalizeLooseText_(candidates[i]);
      if (signature && signatures.indexOf(signature) < 0) signatures.push(signature);
    }
  }
  return signatures;
}

function expandProductAliasNames_(value) {
  var names = [String(value || '')];
  var loose = normalizeLooseText_(value);
  if (loose.indexOf('아삭명이명이나물') >= 0) {
    names.push(String(value || '').replace(/아삭명이\s*명이나물/g, '아삭아삭 명이나물'));
    names.push(String(value || '').replace(/아삭명이\s*명이나물/g, '아삭명이'));
  }
  if (loose.indexOf('김밥집궁채') >= 0) names.push(String(value || '').replace(/김밥집\s*궁채/g, '김밥집궁채'));
  return names;
}

function findSupplementalPriceRule_(item) {
  var signatures = buildProductMatchSignatures_(item.productName, item.spec || '').concat(buildProductMatchSignatures_(item.normalizedProductName, item.normalizedSpec || ''));
  for (var i = 0; i < BRANARK_SUPPLEMENTAL_PRICE_RULES.length; i += 1) {
    var rule = BRANARK_SUPPLEMENTAL_PRICE_RULES[i];
    for (var aliasIndex = 0; aliasIndex < rule.aliases.length; aliasIndex += 1) {
      if (signatures.indexOf(normalizeLooseText_(rule.aliases[aliasIndex])) >= 0) return { productName: rule.productName, spec: rule.spec, supplyPrice: rule.supplyPrice, vat: rule.vat, closingSupplyPrice: rule.closingSupplyPrice, supplemental: true };
    }
  }
  return null;
}

function calculateClosingSupplyPrice_(record) {
  if (record.closingSupplyPrice !== undefined && record.closingSupplyPrice !== null) return Number(record.closingSupplyPrice);
  var base = Number(record.supplyPrice || 0);
  var vat = Number(record.vat || 0);
  if (isFinite(vat) && vat > 0) return Math.round(base * 1.1);
  return base;
}

function getClosingLedgerDisplayName_(item, record) {
  var loose = normalizeLooseText_(item.normalizedProductName || item.productName || '');
  if (loose.indexOf('아삭명이명이나물10kg') >= 0 || loose.indexOf('아삭아삭명이나물10kg') >= 0) return '아삭명이 10kg';
  return item.normalizedProductName || item.productName || record.productName;
}

function getClosingLedgerSheetKind_(sheetName) {
  var normalized = normalizeHeaderText_(sheetName);
  if (normalized === '운송장') return 'waybill';
  if (normalized.indexOf('출고일지') === 0) return 'shipment-ledger';
  return 'other';
}

function extractShipmentLedgerDate_(values, fileName) {
  for (var rowIndex = 0; rowIndex < Math.min(values.length, 8); rowIndex += 1) {
    var row = values[rowIndex] || [];
    for (var colIndex = 0; colIndex < row.length; colIndex += 1) {
      if (normalizeHeaderText_(row[colIndex]) === '출고일') {
        for (var nextCol = colIndex + 1; nextCol < row.length; nextCol += 1) {
          var candidate = normalizeClosingDateValue_(row[nextCol], fileName);
          if (candidate) return candidate;
        }
      }
    }
  }
  return '';
}

function normalizeClosingDateValue_(value, fileName) {
  var text = String(value || '').trim();
  if (!text) return '';
  var serial = toNumberStrict_(text);
  if (isFinite(serial) && serial > 30000 && serial < 60000) {
    var date = new Date(Math.round((serial - 25569) * 86400000));
    return Utilities.formatDate(date, TIMEZONE, 'yyyy-MM-dd');
  }
  var slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slash) {
    var year = slash[3].length === 2 ? '20' + slash[3] : slash[3];
    return year + '-' + pad2_(slash[1]) + '-' + pad2_(slash[2]);
  }
  var normalized = normalizeOrderDate_(text, fileName);
  return normalized === text && text.length < 6 ? '' : normalized;
}

function findHeaderColumn_(row, aliases) {
  if (!row) return null;
  for (var i = 0; i < row.length; i += 1) {
    var header = normalizeHeaderText_(row[i]);
    for (var aliasIndex = 0; aliasIndex < aliases.length; aliasIndex += 1) {
      if (header === normalizeHeaderText_(aliases[aliasIndex])) return i;
    }
  }
  return null;
}
