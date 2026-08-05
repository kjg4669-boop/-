"use client";

interface Props {
  onClose: () => void;
}

const SHORTCUTS = [
  { group: "슬라이드 이동", items: [
    ["Space / →", "다음 슬라이드"],
    ["← / ↑↓", "이전/다음 슬라이드"],
    ["Home / End", "첫/마지막 슬라이드"],
    ["PageUp / PageDown", "이전/다음 항목"],
    ["1 ~ 9", "해당 번호 항목으로 점프"],
    ["/", "빠른 슬라이드 검색"],
  ]},
  { group: "출력 제어", items: [
    ["B", "블랙아웃 토글"],
    ["C", "화면 지우기 토글"],
    ["F", "출력 고정(Freeze)"],
    ["T", "자동 넘기기 토글"],
    ["L", "루프 모드 토글"],
    ["Esc", "블랙/지우기 해제"],
  ]},
  { group: "창·저장", items: [
    ["O", "출력창 열기"],
    ["F5", "라이브/대기 전환"],
    ["⌘S / Ctrl+S", "저장"],
    ["⌘Z / Ctrl+Z", "실행 취소"],
    ["⌘⇧Z / Ctrl⇧Z", "다시 실행"],
    ["?", "단축키 도움말"],
  ]},
];

export default function ShortcutCheatSheet({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-5 w-[560px] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">키보드 단축키</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-xs px-2 py-1 rounded hover:bg-zinc-800">Esc 닫기</button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {SHORTCUTS.map(({ group, items }) => (
            <div key={group}>
              <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wide mb-2">{group}</p>
              {items.map(([key, desc]) => (
                <div key={key} className="flex items-center gap-2 mb-1.5">
                  <kbd className="shrink-0 px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-600 text-[10px] text-zinc-300 font-mono whitespace-nowrap">{key}</kbd>
                  <span className="text-[11px] text-zinc-400">{desc}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10px] text-zinc-600 text-center">입력 필드에 포커스 있을 때는 단축키 비활성</p>
      </div>
    </div>
  );
}
