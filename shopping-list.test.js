const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file:///' + path.resolve(__dirname, 'shopping-list.html').replace(/\\/g, '/');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    failed++;
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // localStorage 초기화 (이전 테스트 데이터 제거)
  const page = await context.newPage();
  await page.goto(FILE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // ──────────────────────────────────────────
  console.log('\n[ 1 ] 아이템 추가 테스트');
  // ──────────────────────────────────────────

  // 1-1. 버튼으로 추가
  await page.fill('#itemInput', '사과');
  await page.click('button:has-text("추가")');
  const item1Text = await page.textContent('li .name');
  assert(item1Text?.trim() === '사과', '버튼으로 아이템 추가');

  // 1-2. Enter 키로 추가
  await page.fill('#itemInput', '바나나');
  await page.keyboard.press('Enter');
  const names = await page.$$eval('li .name', els => els.map(e => e.textContent?.trim()));
  assert(names.includes('바나나'), 'Enter 키로 아이템 추가');

  // 1-3. 빈 값은 추가 안 됨
  await page.fill('#itemInput', '   ');
  await page.click('button:has-text("추가")');
  const countAfterEmpty = await page.$$eval('li .name', els => els.length);
  assert(countAfterEmpty === 2, '빈 입력은 추가되지 않음');

  // 1-4. 추가 후 입력창 비워짐
  await page.fill('#itemInput', '딸기');
  await page.click('button:has-text("추가")');
  const inputVal = await page.inputValue('#itemInput');
  assert(inputVal === '', '추가 후 입력창 초기화');

  // 1-5. summary 카운트 반영
  const summary = await page.textContent('#summary');
  assert(summary?.includes('3'), '요약에 아이템 수 반영');

  // ──────────────────────────────────────────
  console.log('\n[ 2 ] 체크(완료) 기능 테스트');
  // ──────────────────────────────────────────

  // 2-1. 첫 번째 아이템 체크
  const firstCheckbox = page.locator('li input[type="checkbox"]').first();
  await firstCheckbox.check();
  const isChecked = await firstCheckbox.isChecked();
  assert(isChecked, '체크박스 체크 동작');

  // 2-2. 체크된 항목에 취소선 클래스 적용
  const firstLi = page.locator('li').first();
  const hasCheckedClass = await firstLi.evaluate(el => el.classList.contains('checked'));
  assert(hasCheckedClass, '체크 시 .checked 클래스 추가');

  // 2-3. 체크 해제
  await firstCheckbox.uncheck();
  const isUnchecked = !(await firstCheckbox.isChecked());
  assert(isUnchecked, '체크박스 해제 동작');

  // 2-4. 완료된 항목 삭제 버튼 표시
  await firstCheckbox.check();
  await page.waitForSelector('#clearBtn', { state: 'visible' });
  const clearVisible = await page.isVisible('#clearBtn');
  assert(clearVisible, '완료 항목 있을 때 일괄삭제 버튼 표시');

  // 2-5. localStorage에 체크 상태 저장
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('shopping') || '[]'));
  const hasDone = stored.some(i => i.done === true);
  assert(hasDone, '체크 상태가 localStorage에 저장됨');

  // ──────────────────────────────────────────
  console.log('\n[ 3 ] 아이템 삭제 테스트');
  // ──────────────────────────────────────────

  const countBefore = await page.$$eval('li', els => els.length);

  // 3-1. × 버튼으로 삭제
  await page.locator('li .delete-btn').last().click();
  const countAfter = await page.$$eval('li', els => els.length);
  assert(countAfter === countBefore - 1, '× 버튼으로 아이템 삭제');

  // 3-2. 완료 항목 일괄 삭제
  const checkedBefore = await page.$$eval('li.checked', els => els.length);
  assert(checkedBefore >= 1, '일괄삭제 전 체크된 항목 존재');
  await page.click('#clearBtn');
  const checkedAfter = await page.$$eval('li.checked', els => els.length);
  assert(checkedAfter === 0, '완료된 항목 일괄 삭제');

  // 3-3. 모두 삭제 시 빈 화면
  const remaining = await page.$$eval('li .name', els => els.length);
  for (let i = 0; i < remaining; i++) {
    await page.locator('li .delete-btn').first().click();
  }
  const emptyMsg = await page.isVisible('.empty');
  assert(emptyMsg, '모두 삭제 시 빈 화면 메시지 표시');

  // ──────────────────────────────────────────
  console.log('\n[ 4 ] 데이터 영속성 테스트 (localStorage)');
  // ──────────────────────────────────────────

  await page.fill('#itemInput', '우유');
  await page.keyboard.press('Enter');
  await page.fill('#itemInput', '계란');
  await page.keyboard.press('Enter');

  // 페이지 새로고침 후 데이터 유지 확인
  await page.reload();
  const afterReload = await page.$$eval('li .name', els => els.map(e => e.textContent?.trim()));
  assert(afterReload.includes('우유'), '새로고침 후 데이터 유지 (우유)');
  assert(afterReload.includes('계란'), '새로고침 후 데이터 유지 (계란)');

  // ──────────────────────────────────────────
  // 결과 출력
  // ──────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`테스트 결과: ${passed} / ${total} 통과`);
  if (failed > 0) {
    console.error(`실패: ${failed}개`);
  } else {
    console.log('모든 테스트 통과! 🎉');
  }
  console.log('─'.repeat(40));

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();