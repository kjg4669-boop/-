"use client";

import { useState } from "react";

const ONBOARDING_KEY = "worship-onboarding-v1";

// ── Illustrations ────────────────────────────────────────────────────────────

function IllustrationLayout() {
  return (
    <div className="w-full h-full flex flex-col gap-1 p-2">
      <div className="h-5 bg-zinc-700 rounded flex items-center px-2 gap-1">
        <div className="w-2 h-2 rounded-full bg-blue-500" />
        <div className="flex-1 h-1.5 bg-zinc-600 rounded" />
        <div className="w-6 h-2 bg-zinc-600 rounded" />
        <div className="w-6 h-2 bg-zinc-600 rounded" />
      </div>
      <div className="h-4 bg-zinc-800 rounded flex items-center gap-1 px-2">
        {["홈", "삽입", "디자인", "전환"].map((t) => (
          <div key={t} className="text-[6px] text-zinc-400 px-1 py-0.5 bg-zinc-700 rounded">{t}</div>
        ))}
      </div>
      <div className="flex flex-1 gap-1">
        <div className="w-10 bg-zinc-800 rounded flex flex-col gap-0.5 p-1">
          <div className="text-[5px] text-zinc-500 mb-0.5">슬라이드</div>
          {[1, 2, 3].map((i) => <div key={i} className="h-4 bg-zinc-700 rounded" />)}
        </div>
        <div className="flex-1 bg-blue-500/10 border border-blue-500/30 rounded flex items-center justify-center">
          <div className="text-xs text-blue-400 font-medium">편집 캔버스</div>
        </div>
        <div className="w-14 bg-zinc-800 rounded flex flex-col gap-1 p-1">
          <div className="text-[5px] text-zinc-500">라이브러리</div>
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-2.5 bg-zinc-700 rounded" />)}
        </div>
      </div>
    </div>
  );
}

function IllustrationQueue() {
  return (
    <div className="w-full h-full flex flex-col p-2 gap-1">
      <div className="text-[7px] text-zinc-400 font-medium">예배 순서</div>
      <div className="flex-1 flex flex-col gap-1">
        {["✦ 예배 시작", "🎵 주님의 이름", "🎵 찬양해", "📖 요한복음 3:16"].map((item, i) => (
          <div key={i} className={`flex items-center gap-1 px-1.5 py-1 rounded text-[6px] ${i === 1 ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300"}`}>
            <div className={`w-1 h-1 rounded-full shrink-0 ${i === 1 ? "bg-blue-300" : "bg-zinc-500"}`} />
            {item}
          </div>
        ))}
        <div className="mt-1 flex items-center justify-center h-5 border border-dashed border-zinc-600 rounded text-[6px] text-zinc-500">
          + 아이템 추가
        </div>
      </div>
    </div>
  );
}

function IllustrationLibrary() {
  return (
    <div className="w-full h-full flex flex-col p-2 gap-1">
      <div className="flex items-center gap-1 bg-zinc-700 rounded px-1.5 py-1">
        <span className="text-xs text-zinc-400">🔍</span>
        <div className="flex-1 h-1.5 bg-zinc-600 rounded" />
      </div>
      <div className="flex gap-0.5 flex-wrap">
        {["전체", "찬양", "경배", "고백"].map((t, i) => (
          <div key={t} className={`text-[5px] px-1 py-0.5 rounded ${i === 0 ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-400"}`}>{t}</div>
        ))}
      </div>
      <div className="flex-1 flex flex-col gap-0.5">
        {["주님의 이름 높이세", "거룩하신 하나님", "주를 찬양", "아름다운 이름"].map((s, i) => (
          <div key={i} className={`flex items-center justify-between px-1.5 py-0.5 rounded text-[6px] ${i === 0 ? "bg-zinc-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>
            <span>🎵 {s}</span>
            <span className="text-[5px] text-zinc-500">추가</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IllustrationCanvas() {
  return (
    <div className="w-full h-full flex gap-1 p-2">
      <div className="flex-1 bg-zinc-900 rounded border border-zinc-700 relative flex items-center justify-center">
        <div className="flex flex-col items-center gap-1">
          <div className="w-16 h-1.5 bg-white/80 rounded" />
          <div className="w-12 h-1 bg-white/50 rounded" />
        </div>
        <div className="absolute bottom-1 right-1 text-[5px] text-zinc-600">16:9</div>
      </div>
      <div className="w-14 bg-zinc-800 rounded flex flex-col gap-1 p-1">
        <div className="text-[5px] text-zinc-500">배경</div>
        <div className="h-3 bg-zinc-700 rounded" />
        <div className="text-[5px] text-zinc-500 mt-0.5">자막</div>
        <div className="h-2 bg-blue-600/50 border border-blue-500 rounded" />
        <div className="text-[5px] text-zinc-500 mt-0.5">위치</div>
        <div className="flex gap-0.5">
          {["상", "중", "하"].map((p, i) => (
            <div key={p} className={`flex-1 text-[4px] text-center py-0.5 rounded ${i === 2 ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-500"}`}>{p}</div>
          ))}
        </div>
        <div className="text-[5px] text-zinc-500 mt-0.5">전환</div>
        <div className="h-2 bg-zinc-700 rounded" />
      </div>
    </div>
  );
}

function IllustrationOutput() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-2">
      <div className="w-full h-5 bg-zinc-800 rounded flex items-center gap-1 px-2">
        <div className="text-[5px] text-zinc-400">모니터 선택:</div>
        <div className="flex-1 h-2 bg-zinc-700 rounded" />
        <div className="px-1 py-0.5 bg-blue-600 rounded text-[5px] text-white">출력 열기</div>
      </div>
      <div className="flex gap-4 items-end">
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-16 h-10 bg-zinc-800 border border-zinc-600 rounded flex flex-col p-1 gap-0.5">
            <div className="text-[4px] text-zinc-500">컨트롤러</div>
            <div className="flex-1 bg-zinc-700 rounded" />
          </div>
          <div className="w-4 h-0.5 bg-zinc-600" />
          <div className="w-6 h-1 bg-zinc-700 rounded" />
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-20 h-12 bg-black border border-blue-500 rounded flex items-center justify-center">
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-14 h-1.5 bg-white/80 rounded" />
              <div className="w-10 h-1 bg-white/50 rounded" />
            </div>
          </div>
          <div className="w-4 h-0.5 bg-zinc-600" />
          <div className="w-8 h-1 bg-zinc-700 rounded" />
          <div className="text-[5px] text-blue-400">빔 프로젝터</div>
        </div>
      </div>
    </div>
  );
}

function IllustrationBible() {
  return (
    <div className="w-full h-full flex flex-col p-2 gap-1">
      <div className="flex gap-1">
        <div className="flex-1 h-5 bg-zinc-700 rounded flex items-center px-1.5">
          <span className="text-[6px] text-zinc-300">요한복음</span>
        </div>
        <div className="w-10 h-5 bg-zinc-700 rounded flex items-center px-1.5">
          <span className="text-[6px] text-zinc-300">3장</span>
        </div>
      </div>
      <div className="flex-1 flex flex-col gap-0.5 overflow-hidden">
        {[
          { v: "16", t: "하나님이 세상을 이처럼 사랑하사" },
          { v: "17", t: "독생자를 주셨으니" },
          { v: "18", t: "이는 저를 믿는 자마다" },
          { v: "19", t: "영생을 얻게 하려 하심이라" },
        ].map((verse, i) => (
          <div key={i} className={`flex gap-1 items-start px-1 py-0.5 rounded text-[6px] ${i === 0 ? "bg-blue-600/30 border border-blue-500/40" : "bg-zinc-800"}`}>
            <span className="text-blue-400 font-bold w-4 shrink-0">{verse.v}</span>
            <span className="text-zinc-300">{verse.t}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <div className="px-2 py-0.5 bg-blue-600 rounded text-[6px] text-white">예배에 추가</div>
      </div>
    </div>
  );
}

// ── Step data ────────────────────────────────────────────────────────────────

interface StepData {
  icon: string;
  title: string;
  description: string;
  bullets: string[];
  Illustration: () => React.JSX.Element;
}

const STEPS: StepData[] = [
  {
    icon: "🖥️",
    title: "화면 구성 한눈에 보기",
    description: "왼쪽 슬라이드 목록, 가운데 편집 캔버스, 오른쪽 라이브러리·디자인 패널로 구성되어 있습니다.",
    bullets: [
      "리본 탭(홈·삽입·디자인 등)으로 기능 전환",
      "상단 ControlBar로 출력·블랙아웃 제어",
      "하단 상태 표시줄에서 줌 및 시계 확인",
    ],
    Illustration: IllustrationLayout,
  },
  {
    icon: "📋",
    title: "예배 순서를 만들어 보세요",
    description: "오른쪽 패널 > 순서 탭에서 새 예배를 생성하고 찬양·성경·미디어 아이템을 추가하세요.",
    bullets: [
      "⌘N 으로 새 예배 생성",
      "+ 버튼으로 아이템 추가",
      "드래그로 순서 자유롭게 변경",
    ],
    Illustration: IllustrationQueue,
  },
  {
    icon: "🎵",
    title: "찬양을 검색하고 추가하세요",
    description: "오른쪽 패널 > 찬양 탭에서 검색어를 입력하고 곡을 클릭하여 예배에 추가하세요.",
    bullets: [
      "태그로 찬양 분류 및 필터링",
      "가사 편집으로 슬라이드 직접 수정",
      "드래그로 예배 순서에 끌어다 놓기",
    ],
    Illustration: IllustrationLibrary,
  },
  {
    icon: "🎨",
    title: "슬라이드를 꾸며보세요",
    description: "리본 > 홈 탭에서 글꼴·색상 조정, 오른쪽 디자인 패널에서 배경과 자막을 설정하세요.",
    bullets: [
      "배경: 색상·이미지·영상 지원",
      "자막 위치: 상단·중앙·하단 선택",
      "전환 효과 및 애니메이션 적용",
    ],
    Illustration: IllustrationCanvas,
  },
  {
    icon: "📡",
    title: "빔 프로젝터에 투사하세요",
    description: "상단 바에서 모니터를 선택하고 출력 창을 열면 슬라이드가 즉시 투사됩니다.",
    bullets: [
      "블랙아웃: 화면을 빠르게 가리기",
      "자막 숨기기(Clear)로 깔끔하게 전환",
      "Stage Display로 발표자 모니터 지원",
    ],
    Illustration: IllustrationOutput,
  },
  {
    icon: "📖",
    title: "성경 구절과 미디어를 활용하세요",
    description: "삽입 메뉴 > 성경 추가, 또는 성경 JSON 파일을 임포트한 후 구절을 검색하고 예배에 추가하세요.",
    bullets: [
      "이미지·영상 배경 지원",
      "카운트다운 타이머 내장",
      "예배 템플릿 저장 및 재사용",
    ],
    Illustration: IllustrationBible,
  },
];

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  onComplete: () => void;
}

export default function OnboardingGuide({ onComplete }: Props) {
  const [step, setStep] = useState(-1); // -1 = welcome

  function handleDone() {
    localStorage.setItem(ONBOARDING_KEY, "done");
    onComplete();
  }

  function handleNext() {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else handleDone();
  }

  function handlePrev() {
    if (step > 0) setStep((s) => s - 1);
  }

  const current = step >= 0 ? STEPS[step] : null;
  const Illustration = current?.Illustration ?? null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-[720px] max-w-[95vw] overflow-hidden">

        {step === -1 ? (
          /* ── Welcome ────────────────────────────────────────────────────── */
          <div className="flex flex-col items-center gap-6 px-12 py-14 text-center">
            <div className="text-5xl">🎵</div>
            <div>
              <h1 className="text-2xl font-bold text-white mb-2">Worship Projector</h1>
              <p className="text-zinc-400 text-sm">교회 예배 미디어 프로젝션 소프트웨어</p>
            </div>
            <p className="text-zinc-300 text-base mt-2">처음 사용하시나요?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(0)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium transition-colors"
              >
                예, 사용 방법 알려주세요
              </button>
              <button
                onClick={handleDone}
                className="px-5 py-2.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-300 transition-colors"
              >
                아니요, 바로 시작
              </button>
            </div>
          </div>
        ) : (
          /* ── Guide steps ─────────────────────────────────────────────────── */
          <>
            {/* Header: step dots + skip */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
              <div className="flex items-center gap-1.5">
                {STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i === step ? "bg-blue-500" : "bg-zinc-600 hover:bg-zinc-500"
                    }`}
                  />
                ))}
              </div>
              <button
                onClick={handleDone}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded hover:bg-zinc-800"
              >
                스킵
              </button>
            </div>

            {/* Content: left text + right illustration */}
            <div className="flex min-h-[280px]">
              {/* Left: icon + title + description + bullets */}
              <div className="flex-1 flex flex-col gap-4 px-8 py-7">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{current?.icon}</span>
                  <h2 className="text-lg font-semibold text-white">{current?.title}</h2>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed">{current?.description}</p>
                <ul className="flex flex-col gap-2 mt-1">
                  {current?.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                      <span className="text-blue-400 mt-0.5 shrink-0">✓</span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Right: CSS illustration */}
              <div className="w-[280px] shrink-0 border-l border-zinc-800 bg-zinc-950 flex items-center justify-center p-3">
                <div className="w-full h-[200px]">
                  {Illustration && <Illustration />}
                </div>
              </div>
            </div>

            {/* Footer: prev / step indicator / next */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800">
              <button
                onClick={handlePrev}
                disabled={step === 0}
                className="px-4 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ← 이전
              </button>
              <span className="text-xs text-zinc-500">{step + 1} / {STEPS.length}</span>
              <button
                onClick={handleNext}
                className="px-4 py-1.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
              >
                {step === STEPS.length - 1 ? "시작하기 →" : "다음 →"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
