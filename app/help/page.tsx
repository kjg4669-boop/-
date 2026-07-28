"use client";

export default function HelpPage() {
  return (
    <div className="bg-zinc-900 text-white min-h-screen text-xs select-none">
      {/* Title bar area */}
      <div className="bg-zinc-800 border-b border-zinc-700 px-5 py-3">
        <p className="text-zinc-300 font-semibold text-sm">찬양 슬라이드 시작하기</p>
        <p className="text-zinc-500 text-[11px] mt-0.5">Worship Projector 사용 가이드</p>
      </div>

      <div className="p-5 space-y-5">
        <Step n={1} title="예배 만들기">
          오른쪽 <Chip>순서</Chip> 탭 → 상단 <Chip>+</Chip> 버튼으로 새 예배를 만드세요.
          예배가 없으면 찬양을 순서에 추가할 수 없습니다.
        </Step>

        <Step n={2} title="새 찬양 추가">
          <Chip>찬양</Chip> 탭 → <Chip>+ 새 찬양</Chip> 클릭
          <ul className="mt-1.5 space-y-1 text-zinc-400 list-none">
            <li>① <strong className="text-zinc-300">제목</strong> 입력 (필수)</li>
            <li>② 섹션 선택 — 절 / 코러스 / 브릿지 / 인트로 / 아웃트로</li>
            <li>③ 가사 입력 <span className="text-zinc-500">(Enter로 줄 바꿈)</span></li>
            <li>④ <Chip>+ 섹션 추가</Chip>로 블록 추가 후 <Chip>저장</Chip></li>
          </ul>
          <p className="mt-2 text-zinc-500">
            PPTX 파일이 있으면 <Chip>PPTX</Chip> 버튼으로 바로 가져오기
          </p>
        </Step>

        <Step n={3} title="예배 순서에 추가">
          찬양 목록에서 찬양을 <strong className="text-white">클릭</strong>하면
          현재 예배 순서 맨 뒤에 추가됩니다.
          예배가 선택되지 않은 경우 안내 메시지가 나타납니다.
        </Step>

        <Step n={4} title="슬라이드 편집">
          왼쪽 슬라이드 패널에서 슬라이드를 클릭하면 캔버스에 가사 블록이 나타납니다.
          <ul className="mt-1.5 space-y-1 text-zinc-400">
            <li><strong className="text-zinc-300">드래그</strong> — 블록 위치 이동</li>
            <li><strong className="text-zinc-300">모서리 핸들</strong> — 크기 조절</li>
            <li><strong className="text-zinc-300">더블클릭</strong> — 텍스트 직접 편집</li>
            <li><strong className="text-zinc-300">Delete</strong> — 선택 블록 삭제</li>
          </ul>
          <p className="mt-2 text-zinc-500">
            상단 <Chip>삽입</Chip> 탭에서 이미지·비디오 배경을 추가할 수 있습니다.
          </p>
        </Step>

        <Step n={5} title="발표하기">
          상단 <Chip>📺 출력창</Chip> 버튼으로 2번 모니터에 화면을 출력하세요.
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-zinc-400">
            <div><Kbd>Space</Kbd> 다음 슬라이드</div>
            <div><Kbd>← →</Kbd> 이전 / 다음</div>
            <div><Kbd>B</Kbd> 블랙아웃 전환</div>
            <div><Kbd>C</Kbd> 화면 지우기</div>
            <div><Kbd>L</Kbd> 루프 전환</div>
          </div>
        </Step>

        <div className="border-t border-zinc-700 pt-4">
          <p className="text-zinc-600 text-[10px] text-center">
            Worship Projector — 예배를 위한 슬라이드 발표 도구
          </p>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 font-bold text-[11px] mt-0.5">
        {n}
      </span>
      <div className="leading-relaxed flex-1">
        <p className="font-semibold text-white text-[13px] mb-1">{title}</p>
        <div className="text-zinc-400">{children}</div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block bg-zinc-700 text-zinc-200 px-1.5 py-0.5 rounded text-[10px] leading-tight border border-zinc-600">
      {children}
    </span>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded text-[10px] font-mono border border-zinc-600">
      {children}
    </kbd>
  );
}
