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
      differences.push({
        key: primaryGroup.key,
        productName: primaryGroup.productName,
        primaryQuantity: primaryGroup.quantity,
        validationQuantity: validationQuantity,
        validationProductName: matchedValidation ? matchedValidation.productName : '',
        rule: '운송장 상품명1과 출고일지 제품명을 띄어쓰기/괄호/중국완제/KG/_숫자 기준으로 보정 비교'
      });
    }
  }

  for (var j = 0; j < validationGroups.length; j += 1) {
    if (matchedValidationIndexes[j]) continue;
    var validationGroup = validationGroups[j];
    var matchedPrimary = findLenientGroupMatch_(primaryGroups, validationGroup.signatures);
    if (matchedPrimary) continue;
    differences.push({
      key: validationGroup.key,
      productName: validationGroup.productName,
      primaryQuantity: 0,
      validationQuantity: validationGroup.quantity,
      validationProductName: validationGroup.productName,
      rule: '운송장에는 있으나 출고일지/출고일지(2) 전체에서 매칭되는 제품명을 찾지 못함'
    });
  }

  return {
    primarySheet: primarySheets.map(function(item) { return item.sheetName; }).join(', '),
    validationSheets: validationSheets.map(function(item) { return item.sheetName; }),
    primaryQuantityTotal: sumRowQuantity_(primaryRows),
    validationQuantityTotal: sumRowQuantity_(validationRows),
    quantityMatched: validationSheets.length ? differences.length === 0 : true,
    comparisonPerformed: validationSheets.length > 0,
    validationRule: '운송장 상품명1(G열)의 _숫자 배수를 출고일지/출고일지(2)의 제품명·수량 합계와 유연 비교합니다.',
    differences: differences
  };
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
    groups.push({
      index: groups.length,
      key: signatures[0],
      signatures: signatures,
      productName: productName,
      quantity: Number(row.quantity || 0),
      rawProductNames: rawProductNames
    });
  }
  return groups;
}

function findLenientGroupMatch_(groups, signatures) {
  var signatureIndex = {};
  for (var i = 0; i < signatures.length; i += 1) {
    signatureIndex[signatures[i]] = true;
  }
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
