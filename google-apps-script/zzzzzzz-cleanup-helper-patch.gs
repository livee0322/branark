function cleanupTemporaryFiles_(fileIds) {
  if (!fileIds || !fileIds.length) return;

  for (var i = 0; i < fileIds.length; i += 1) {
    var fileId = String(fileIds[i] || '').trim();
    if (!fileId) continue;

    try {
      DriveApp.getFileById(fileId).setTrashed(true);
    } catch (error) {
      // 임시 파일 삭제 실패는 일일마감 반영 결과를 막지 않습니다.
      // 권한/이미 삭제됨/파일 없음 등의 경우 조용히 넘어갑니다.
    }
  }
}
