const fileInput = document.querySelector('#orderFile');
const fileName = document.querySelector('#fileName');
const resultFileName = document.querySelector('#resultFileName');
const validateButton = document.querySelector('#validateButton');
const uploadMessage = document.querySelector('#uploadMessage');
const statusItems = Array.from(document.querySelectorAll('#statusList li'));

const allowedExtensions = ['xlsx', 'xls', 'csv'];

function getExtension(name) {
  return name.split('.').pop().toLowerCase();
}

function setStatus(index, state, label) {
  const item = statusItems[index];
  if (!item) return;
  item.dataset.state = state;
  item.querySelector('small').textContent = label;
}

function resetStatus() {
  statusItems.forEach((item) => {
    item.dataset.state = 'waiting';
    item.querySelector('small').textContent = '대기';
  });
}

fileInput.addEventListener('change', () => {
  resetStatus();
  const file = fileInput.files?.[0];
  if (!file) {
    fileName.textContent = '파일을 선택하세요';
    resultFileName.textContent = '브랜아크_맛집밥상_발주서_260702.xlsx';
    uploadMessage.textContent = '현재 화면은 HTML 프로토타입입니다. 실제 Drive 저장/API 연결은 후속 단계에서 진행합니다.';
    return;
  }

  fileName.textContent = file.name;
  resultFileName.textContent = file.name;

  const extension = getExtension(file.name);
  if (!allowedExtensions.includes(extension)) {
    uploadMessage.textContent = '지원하지 않는 파일 형식입니다.';
    setStatus(0, 'error', '실패');
    return;
  }

  uploadMessage.textContent = '파일 형식은 정상입니다. 업로드 및 검증 시작을 눌러주세요.';
  setStatus(0, 'success', '성공');
});

validateButton.addEventListener('click', () => {
  const file = fileInput.files?.[0];

  resetStatus();

  if (!file) {
    uploadMessage.textContent = '먼저 발주서 파일을 선택해주세요.';
    return;
  }

  const extension = getExtension(file.name);
  if (!allowedExtensions.includes(extension)) {
    uploadMessage.textContent = '지원하지 않는 파일 형식입니다.';
    setStatus(0, 'error', '실패');
    return;
  }

  const steps = [
    '파일 형식 확인 완료',
    '중복 파일명 확인 필요',
    'Google Drive 저장 API 연결 예정',
    '운송장/출고일지 분석 API 연결 예정',
    '단가표 매칭 API 연결 예정',
    '일일 마감 양식 반영 API 연결 예정',
  ];

  steps.forEach((label, index) => {
    window.setTimeout(() => {
      setStatus(index, 'success', index === 1 ? '확인 필요' : '성공');
      uploadMessage.textContent = label;

      if (index === steps.length - 1) {
        uploadMessage.textContent = '프로토타입 검증이 완료되었습니다. 실제 자동화는 API 연결 후 동작합니다.';
      }
    }, 260 * (index + 1));
  });
});
