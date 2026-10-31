"use client";

import "./games.css";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { ApiFail, apiPost, errorMessage } from "@/lib/api";
import { sfx } from "@/lib/sound";
import { GAME_RULES } from "@/core/rules";
import type { Answer, Cefr, GameId, Question } from "@/core/types";
import type { FinishResponse, StartRequest, StartResponse } from "@/types/api";
import { BlitzGame } from "../blitz";
import { BuildGame } from "../build";
import { ClozeGame } from "../cloze";
import { FlashGame } from "../flash";
import { ListenGame } from "../listen";
import { MatchGame } from "../match";
import { QuizGame } from "../quiz";
import { ScrambleGame } from "../scramble";
import { TfGame } from "../tf";
import { TypeGame } from "../type";
import { gameById } from "../registry";
import { ResultView } from "./ResultView";
import { sleep, type GameProps } from "./types";

const COMPONENTS: Record<GameId, ComponentType<GameProps>> = {
  quiz: QuizGame,
  blitz: BlitzGame,
  type: TypeGame,
  scramble: ScrambleGame,
  cloze: ClozeGame,
  listen: ListenGame,
  match: MatchGame,
  flash: FlashGame,
  build: BuildGame,
  tf: TfGame,
};

/** Cách chơi, hiện ở màn trước khi bắt đầu. */
const HOWTO: Record<GameId, string[]> = {
  quiz: ["Mỗi câu hiện một từ tiếng Anh, chọn nghĩa tiếng Việt đúng.", "Chọn xong là tự sang câu tiếp. Có thể bấm phím 1–4 để chọn."],
  blitz: [
    "Bạn có 60 giây. Chọn nghĩa đúng càng nhiều càng tốt, chọn xong là sang câu ngay.",
    "Trả lời đúng liên tiếp để tăng combo (nhân điểm ×1 đến ×4). Sai 3 lần là hết mạng.",
    "Điểm, combo và mạng do hệ thống tính khi nộp bài, nên chỉ cần trả lời thật nhanh và thật chắc.",
  ],
  type: ["Nhìn nghĩa tiếng Việt và gợi ý chữ cái, gõ từ tiếng Anh tương ứng.", "Gõ sai đúng một chữ ở từ dài vẫn được tính đúng. Bấm Enter để sang câu tiếp."],
  scramble: ["Sắp xếp các chữ cái bị xáo trộn thành từ tiếng Anh có nghĩa như gợi ý.", "Bấm chữ để đặt lên, bấm chữ đã đặt để bỏ ra. Trên máy tính có thể gõ trực tiếp bằng bàn phím."],
  cloze: ["Điền từ còn thiếu vào câu tiếng Anh thật.", "Có câu chọn đáp án, có câu phải gõ (khi đó từ gốc được ghi trong ngoặc nếu cần chia lại)."],
  listen: ["Trình duyệt đọc to một từ tiếng Anh, bạn chọn nghĩa tiếng Việt đúng.", "Bấm nút loa để nghe lại, hoặc “Nghe chậm”. Cần bật âm thanh của thiết bị."],
  match: ["Chọn một từ tiếng Anh ở cột trái rồi chọn nghĩa của nó ở cột phải.", "Ghép đúng thì cặp biến mất. Trò này báo đúng/sai ngay và không ảnh hưởng lịch ôn từ."],
  flash: ["Nhớ nghĩa của từ trước, rồi lật thẻ để kiểm tra và tự đánh giá.", "“Chưa nhớ” sẽ cho gặp lại thẻ đó một lần. Phím ← / → để chọn nhanh. Trò này không ảnh hưởng lịch ôn từ."],
  build: ["Sắp xếp các từ thành câu tiếng Anh đúng, theo nghĩa tiếng Việt gợi ý.", "Bấm từ ở dưới để đưa lên câu, bấm từ trong câu để bỏ ra."],
  tf: ["Mỗi câu ngữ pháp đã được điền sẵn. Chọn Đúng nếu câu đúng ngữ pháp, Sai nếu có lỗi.", "Chọn xong là tự sang câu tiếp."],
};

type Round = { roundId: string; items: Question[]; practice: boolean; startedAt: number; attempt: number };
type Phase = "intro" | "starting" | "playing" | "submitting" | "failed" | "result";
type Failure = { message: string; canRetry: boolean };

export type RunnerScope = { cefr: string; domain?: string; topic?: string };

type Props = { game: GameId; scope: RunnerScope; label: string };

function startFailure(e: ApiFail): string {
  switch (e.code) {
    case "RATE_LIMITED":
      return "Bạn bắt đầu quá nhiều vòng trong một giờ. Hãy nghỉ một chút rồi chơi tiếp.";
    case "NO_CONTENT":
      return "Phạm vi này chưa đủ từ vựng để tạo vòng chơi. Thử chọn phạm vi khác.";
    case "LEVEL_ONLY":
      return "Trò này chỉ chơi theo cấp, không chơi theo chủ đề.";
    default:
      return e.status === 403 ? "Cấp này đang khóa. Bạn cần qua bài kiểm tra của cấp trước." : e.message;
  }
}

function finishFailure(e: unknown): Failure {
  if (e instanceof ApiFail) {
    switch (e.code) {
      case "ROUND_INVALID":
        return { message: "Vòng này đã kết thúc hoặc không còn hiệu lực nên không tính được kết quả.", canRetry: false };
      case "NO_ANSWERS":
        return { message: "Bạn chưa trả lời câu nào nên vòng này không được tính.", canRetry: false };
      case "TOO_FAST":
        return { message: "Hệ thống thấy bạn nộp quá nhanh. Đợi vài giây rồi nộp lại.", canRetry: true };
      case "RATE_LIMITED":
        return { message: "Bạn nộp quá nhiều vòng trong một giờ. Hãy nghỉ một chút rồi nộp lại.", canRetry: true };
    }
  }
  return { message: errorMessage(e), canRetry: true };
}

export function GameRunner({ game, scope, label }: Props) {
  const meta = gameById(game)!;
  const rule = GAME_RULES[game];
  const Game = COMPONENTS[game];

  const [phase, setPhase] = useState<Phase>("intro");
  const [round, setRound] = useState<Round | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [result, setResult] = useState<{ res: FinishResponse; answered: number; total: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [speechOk, setSpeechOk] = useState(true);

  const sending = useRef(false);
  const pending = useRef<Answer[]>([]);
  const roundRef = useRef<Round | null>(null);
  roundRef.current = round;

  useEffect(() => {
    setSpeechOk(typeof speechSynthesis !== "undefined");
  }, []);

  // cảnh báo khi đóng/tải lại trang giữa vòng
  const inRound = phase === "playing" || phase === "submitting" || phase === "failed";
  useEffect(() => {
    if (!inRound) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [inRound]);

  const start = useCallback(async () => {
    setStartError(null);
    setFailure(null);
    setLeaving(false);
    setPhase("starting");
    const body: StartRequest = {
      game,
      scope: scope.topic ? { by: "topic", topicSlug: scope.topic } : { by: "level", cefr: scope.cefr as Cefr, domain: scope.domain ?? "all" },
    };
    try {
      const r = await apiPost<StartResponse>("/api/play/start", body);
      sending.current = false;
      setRound((prev) => ({ roundId: r.roundId, items: r.items, practice: r.practice, startedAt: Date.now(), attempt: (prev?.attempt ?? 0) + 1 }));
      setPhase("playing");
    } catch (e) {
      setStartError(e instanceof ApiFail ? startFailure(e) : errorMessage(e));
      setPhase("intro");
    }
  }, [game, scope.cefr, scope.domain, scope.topic]);

  const submit = useCallback(
    async (answers: Answer[]) => {
      const r = roundRef.current;
      if (!r || sending.current) return;
      sending.current = true;
      pending.current = answers;
      setFailure(null);

      if (answers.length === 0) {
        setFailure(finishFailure(new ApiFail(400, "NO_ANSWERS", "")));
        setPhase("failed");
        sending.current = false;
        return;
      }

      setPhase("submitting");
      // Server từ chối nộp sớm hơn (số giây tối thiểu × số câu) kể từ lúc tạo vòng: chờ nốt thay vì để người chơi gặp lỗi.
      const wait = rule.minSecondsPerAnswer * answers.length * 1000 + 500 - (Date.now() - r.startedAt);
      if (wait > 0) await sleep(wait);

      try {
        const res = await apiPost<FinishResponse>("/api/play/finish", {
          roundId: r.roundId,
          answers: answers.map((a) => ({
            qid: a.qid,
            value: a.value,
            ...(a.attempts !== undefined ? { attempts: a.attempts } : {}),
            ...(a.responseMs !== undefined ? { responseMs: a.responseMs } : {}),
          })),
        });
        sfx(res.perfect ? "levelup" : "done");
        setResult({ res, answered: answers.length, total: r.items.length });
        setPhase("result");
      } catch (e) {
        setFailure(finishFailure(e));
        setPhase("failed");
      } finally {
        sending.current = false;
      }
    },
    [rule.minSecondsPerAnswer],
  );

  const retry = useCallback(() => {
    void submit(pending.current);
  }, [submit]);

  const back = `/level/${scope.cefr}`;

  /* ---------- kết quả ---------- */
  if (phase === "result" && result) {
    return <ResultView meta={meta} result={result.res} answered={result.answered} total={result.total} cefr={scope.cefr} scope={scope} onReplay={() => void start()} />;
  }

  /* ---------- đang chơi / nộp / lỗi nộp ---------- */
  if ((phase === "playing" || phase === "submitting" || phase === "failed") && round) {
    return (
      <div className="stack" style={{ gap: 16 }}>
        <div className="spread">
          <div className="row" style={{ gap: 8 }}>
            <span aria-hidden="true" style={{ fontSize: 22 }}>{meta.emoji}</span>
            <b>{meta.name}</b>
            <span className="chip chip-plain">{scope.cefr} · {label}</span>
          </div>
          {phase === "playing" ? (
            <button type="button" className="btn btn-light btn-sm" onClick={() => setLeaving(true)}>
              ✕ Thoát
            </button>
          ) : null}
        </div>

        {leaving && phase === "playing" ? (
          <section className="sheet sheet-plain stack" role="alertdialog" aria-labelledby="lv-h" style={{ borderColor: "var(--red)" }}>
            <h2 id="lv-h">Thoát vòng chơi?</h2>
            <p className="muted">Kết quả của vòng này sẽ không được tính.</p>
            <div className="row">
              <Link href={back} className="btn btn-red">Thoát</Link>
              <button type="button" className="btn btn-light" onClick={() => setLeaving(false)}>Chơi tiếp</button>
            </div>
          </section>
        ) : null}

        {round.practice && phase === "playing" ? (
          <p className="gate">Chế độ luyện tập: những từ này bạn đã thuộc và chưa đến hạn ôn, chơi để nhớ chắc hơn.</p>
        ) : null}

        {phase === "playing" ? (
          <Game key={round.attempt} items={round.items} onFinish={(a) => void submit(a)} />
        ) : phase === "submitting" ? (
          <div className="sheet sheet-plain state" role="status" aria-live="polite">
            <div className="big" aria-hidden="true">📝</div>
            <h2>Đang chấm bài…</h2>
            <p className="muted">Đừng đóng trang, kết quả sẽ hiện ngay.</p>
          </div>
        ) : (
          <div className="sheet sheet-plain state" role="alert">
            <div className="big" aria-hidden="true">⚠️</div>
            <h2>Chưa nộp được bài</h2>
            <p className="muted">{failure?.message}</p>
            <div className="row" style={{ justifyContent: "center" }}>
              {failure?.canRetry ? (
                <button type="button" className="btn btn-mark" onClick={retry}>Nộp lại</button>
              ) : (
                <button type="button" className="btn btn-mark" onClick={() => void start()}>Chơi vòng mới</button>
              )}
              <Link href={back} className="btn btn-light">Về cấp {scope.cefr}</Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ---------- màn bắt đầu ---------- */
  const starting = phase === "starting";
  const noSpeech = game === "listen" && !speechOk;
  return (
    <div className="stack" style={{ gap: 20 }}>
      <Link href={back} className="back">‹ Cấp {scope.cefr}</Link>

      <header className="stack" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 12, flexWrap: "nowrap" }}>
          <span aria-hidden="true" style={{ fontSize: 40, lineHeight: 1 }}>{meta.emoji}</span>
          <div className="stack" style={{ gap: 2 }}>
            <h1>{meta.name}</h1>
            <p className="muted">{meta.blurb}</p>
          </div>
        </div>
        <div className="row">
          <span className="chip">Cấp {scope.cefr}</span>
          <span className="chip chip-plain">{label}</span>
          <span className="chip chip-mark">+{meta.xp} XP mỗi {game === "flash" ? "thẻ" : game === "match" ? "cặp" : "câu đúng"}</span>
          {meta.srs ? <span className="chip chip-good">Tính lịch ôn từ</span> : <span className="chip chip-plain">Không tính lịch ôn</span>}
        </div>
      </header>

      <section className="sheet" aria-labelledby="how-h">
        <h2 id="how-h" style={{ marginBottom: 10 }}>Cách chơi</h2>
        <ul className="rules">
          {HOWTO[game].map((t) => (
            <li key={t}>{t}</li>
          ))}
          <li>Tối đa {rule.cap} {game === "flash" ? "thẻ" : game === "match" ? "cặp" : "câu"} mỗi vòng.</li>
        </ul>
      </section>

      {noSpeech ? <p className="gate gate-bad">Trình duyệt của bạn không hỗ trợ giọng đọc nên không chơi được trò này. Hãy thử Chrome, Edge hoặc Safari.</p> : null}
      {startError ? <p className="err" role="alert">{startError}</p> : null}

      <div className="row">
        <button type="button" className="btn btn-mark" disabled={starting || noSpeech} onClick={() => void start()}>
          {starting ? "Đang chuẩn bị…" : "Bắt đầu"}
        </button>
        <Link href={back} className="btn btn-light">Chọn trò khác</Link>
      </div>
    </div>
  );
}
