import { ApiDemo } from "@/components/ApiDemo";
import Image from "next/image";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white text-zinc-900 dark:from-black dark:to-black dark:text-zinc-50">
      <header className="mx-auto max-w-6xl px-6 pt-10">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <div className="text-xl font-bold tracking-tight">OneGo Tournament Cloud</div>
            <div className="rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
              OTC
            </div>
          </div>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">多棋種一站式雲端賽務平台（概念展示）</div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-16 pt-10">
        <section className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              OneGo棋賽雲：從線上報名、繳費到編排與成績管理，全程自動化與數位化
            </h1>
            <p className="mt-5 text-lg leading-8 text-zinc-700 dark:text-zinc-300">
              專為圍棋、西洋棋、象棋與五子棋打造的「多棋種賽務平台」。後端以{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">賽事（Tournament）</span> 與{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">對局（Match）</span> 為核心，
              前端以規則外掛套用不同棋種的計分/結果/規則差異。
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <a
                href="/#demo"
                className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                看 API 串接展示
              </a>
              <a
                href="/#roadmap"
                className="inline-flex items-center justify-center rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-900"
              >
                查看 MVP/Next 分期
              </a>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { k: "多主辦單位", v: "Organization 多租戶隔離" },
                { k: "規則外掛", v: "GameKey + rulesetVersion" },
                { k: "狀態機 API", v: "報名→付款→報到→編排→結算" },
              ].map((x) => (
                <div key={x.k} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="text-sm font-semibold">{x.k}</div>
                  <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{x.v}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">支援棋種（MVP）</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { title: "圍棋", sub: "go", icon: "/games/go.svg", desc: "勝負/和局/作廢，先做最小計分" },
                { title: "西洋棋", sub: "chess", icon: "/games/chess.svg", desc: "勝負/和局/作廢，後續擴展 tiebreak" },
                { title: "象棋", sub: "xiangqi", icon: "/games/xiangqi.svg", desc: "同一流程，棋種差異由 rules plugin 承接" },
                { title: "五子棋", sub: "gomoku", icon: "/games/gomoku.svg", desc: "可擴充更多棋種，不侵入核心流程" },
              ].map((g) => (
                <div key={g.sub} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Image src={g.icon} alt={g.title} width={22} height={22} />
                      <div className="text-base font-bold">{g.title}</div>
                    </div>
                    <div className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                      {g.sub}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{g.desc}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl bg-gradient-to-r from-zinc-900 to-zinc-700 p-5 text-white dark:from-zinc-50 dark:to-zinc-200 dark:text-zinc-900">
              <div className="text-sm font-semibold">首頁簡介文案（草案）</div>
              <div className="mt-2 text-sm leading-6 opacity-95">
                OneGo棋賽雲整合「線上報名與繳費」「現場報到與對局編排」「即時成績與歷史戰績管理」，讓主辦單位大幅減少紙本與人工統計負擔。
                <br />
                參賽者與家長可用同一帳號，查看多棋種、多賽事的報名紀錄、對局資訊與累積成績，建立專屬的棋力成長履歷。
              </div>
            </div>
          </div>
        </section>

        <section className="mt-14 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-sm font-semibold">兩種入口（概念）</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="text-base font-bold">主辦後台</div>
                <ul className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                  <li>建立賽事、設定棋種/規則版本</li>
                  <li>報名/付款管理（MVP 先 Mock）</li>
                  <li>報到調整、編排、上傳結果</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="text-base font-bold">參賽者入口</div>
                <ul className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                  <li>同帳號跨賽事/跨棋種紀錄</li>
                  <li>查詢對局、即時成績</li>
                  <li>個資遮罩/半公開榜單</li>
                </ul>
              </div>
            </div>
          </div>

          <div id="roadmap" className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-sm font-semibold">MVP / Next（摘要）</div>
            <div className="mt-4 grid gap-3">
              {[
                {
                  title: "MVP：可辦賽",
                  items: ["多主辦單位（Organization）", "賽事/對局核心（Tournament/Match）", "報名/報到/簡易編排/上傳結果/排名", "規則外掛（rules plugin）"],
                },
                {
                  title: "Next：差異化",
                  items: ["Swiss/循環/淘汰編排", "可配置輔分鏈（tiebreak pipeline）", "正式支付整合（保持 PaymentProvider 抽象）", "通知/稽核（audit log）"],
                },
              ].map((b) => (
                <div key={b.title} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <div className="text-base font-bold">{b.title}</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
                    {b.items.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="demo" className="mt-14">
          <ApiDemo />
        </section>

        <footer className="mt-14 border-t border-zinc-200 pt-8 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          <div>英文全名：OneGo Tournament Cloud: Unified Board Game Event Platform（簡稱 OTC）</div>
          <div className="mt-1">本頁為概念展示；實作以 repo 內 docs/ 與 apps/api 為準。</div>
        </footer>
      </main>
    </div>
  );
}
