import { Fragment, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Check,
  Heart,
  Minus,
  Star,
  Target,
  X,
} from "lucide-react"

import { ProgramLogo } from "@/components/ProgramLogo"
import { Accordion, AccordionItem } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { UNI_CONTENT, type RichBlock, type UniSection } from "@/data/uniContent"
import { deadlineLabel } from "@/lib/roadmap"
import { readPersist } from "@/lib/persist"
import type { AnyProgram, Grant, University } from "@/legacy"
import { cn } from "@/lib/utils"

/* ---------- shared motion presets (ease-out, 200–300ms) ---------- */
const EASE = [0.16, 1, 0.3, 1] as const
const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } },
}
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
}

/* ---------- grants relevant to a specific university (same scoring as legacy) ---------- */
/* named awards > same country > EU-wide > field match */
function grantsForUni(u: University): Grant[] {
  const uniWord = (u.name || "").split(/\s+/).find((w) => w.length > 4) || u.name
  const generic = /все|любые|200\+|программ/i
  return window.AdmiticaData.grants
    .map((g) => {
      let score = 0
      if (
        g.name.toLowerCase().includes(uniWord.toLowerCase()) ||
        (g.desc || "").toLowerCase().includes(uniWord.toLowerCase())
      )
        score += 5
      if (g.country === u.country) score += 3
      if (g.country === "ЕС") score += 2
      if (generic.test(g.field || "")) score += 1
      else if (u.field && (g.field || "").toLowerCase().includes(u.field.split(/[,\s]/)[0].toLowerCase()))
        score += 2
      if (u.degree && (g.degree || "").toLowerCase().includes(u.degree.split(/[\s/]/)[0].toLowerCase()))
        score += 1
      return { g, score }
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.g)
}

/* ---------- admission chances estimate (real, from the onboarding answers) ---------- */
interface OnbProfile {
  gpa?: string | null
  gpaUnknown?: boolean
  english?: string
  budget?: string
  budgetUnknown?: boolean
  langs?: { lang: string | null; level: string | null }[]
}

const CEFR_BAND: Record<string, number> = { A1: 3, A2: 4, B1: 5, B2: 6.5, C1: 7.5, C2: 8.5 }
const LANG_RU: Record<string, string> = {
  DE: "немецкий", FR: "французский", NL: "нидерландский", DK: "датский", IT: "итальянский", ES: "испанский",
}
const LANG_RU_GEN: Record<string, string> = {
  DE: "немецкого", FR: "французского", NL: "нидерландского", DK: "датского", IT: "итальянского", ES: "испанского",
}

function gpaFraction(s: string): number | null {
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/)
  if (m) {
    const a = parseFloat(m[1].replace(",", ".")),
      b = parseFloat(m[2].replace(",", "."))
    if (b > 0) return a / b
  }
  return null
}
function budgetNumber(s: string): number {
  if (/∞|без огранич/i.test(s)) return Infinity
  if (/беспл/i.test(s)) return 0
  const d = s.replace(/[^0-9]/g, "")
  return d ? parseInt(d, 10) : Infinity
}

type ChanceStatus = "ok" | "warn" | "risk" | "info"
interface ChanceResult {
  verdict: string
  tone: ChanceStatus
  factors: { status: ChanceStatus; text: string }[]
}

/** Compare the student's onboarding answers against a university's stated requirements. */
function estimateChances(u: University, p: OnbProfile | null): ChanceResult | null {
  if (!p) return null
  const factors: ChanceResult["factors"] = []
  let score = 0
  let compared = 0

  // Budget vs tuition
  if (!p.budgetUnknown && p.budget) {
    const b = budgetNumber(p.budget)
    if (isFinite(b) && typeof u.tuitionMax === "number") {
      compared++
      if (u.tuitionMax <= b) {
        factors.push({ status: "ok", text: `Стоимость ${u.tuition} укладывается в твой бюджет` })
        score++
      } else if (u.tuitionMax <= b * 1.2) {
        factors.push({ status: "warn", text: `Стоимость ${u.tuition} немного выше твоего бюджета` })
      } else {
        factors.push({ status: "risk", text: `Стоимость ${u.tuition} заметно выше твоего бюджета` })
        score--
      }
    }
  }

  // GPA vs requirement (only when both sides are numeric)
  if (!p.gpaUnknown && p.gpa) {
    const user = parseFloat(p.gpa)
    const req = gpaFraction(u.gpa || "")
    if (!isNaN(user) && req != null) {
      compared++
      const userFrac = user / 5
      if (userFrac >= req) {
        factors.push({ status: "ok", text: `Средний балл ${p.gpa} соответствует требованию (${u.gpa})` })
        score++
      } else if (userFrac >= req - 0.07) {
        factors.push({ status: "warn", text: `Средний балл ${p.gpa} на границе требования (${u.gpa})` })
      } else {
        factors.push({ status: "risk", text: `Средний балл ${p.gpa} ниже требования (${u.gpa})` })
        score--
      }
    } else if (u.gpa) {
      factors.push({ status: "info", text: `Особые требования к оценкам: ${u.gpa}` })
    }
  }

  // Language: a non-English requirement (e.g. "C1 DE") checks the student's extra languages; otherwise English
  const langReq = (u.ielts || "").match(/\b([ABC][12])\s*(DE|FR|NL|DK|IT|ES)\b/i)
  if (langReq) {
    const code = langReq[2].toUpperCase()
    const need = langReq[1].toUpperCase()
    const ru = LANG_RU[code] || code
    const ruGen = LANG_RU_GEN[code] || ru
    const known = (p.langs || []).find((l) => l.lang && l.lang.toLowerCase().includes(ru.slice(0, 4)))
    if (known?.level && (CEFR_BAND[known.level] ?? 0) >= (CEFR_BAND[need] ?? 99)) {
      compared++
      factors.push({ status: "ok", text: `Ты указал ${ru} на уровне ${known.level} (нужно ${need})` })
      score++
    } else if (known?.level) {
      compared++
      factors.push({ status: "warn", text: `Программа на ${ruGen}: твой уровень ${known.level} ниже нужного ${need}` })
    } else {
      factors.push({ status: "info", text: `Программа требует ${ruGen} на уровне ${need}` })
    }
  } else if (p.english) {
    const m = (u.ielts || "").match(/(\d+(?:\.\d+)?)/)
    const reqBand = m ? parseFloat(m[1]) : NaN
    const userBand = CEFR_BAND[p.english]
    if (!isNaN(reqBand) && userBand != null) {
      compared++
      if (userBand >= reqBand) {
        factors.push({ status: "ok", text: `Английского ${p.english} достаточно (нужно ~${u.ielts})` })
        score++
      } else if (userBand >= reqBand - 0.75) {
        factors.push({ status: "warn", text: `Английский ${p.english} близок к требованию (${u.ielts})` })
      } else {
        factors.push({ status: "risk", text: `Английский ${p.english} ниже требования (${u.ielts})` })
        score--
      }
    }
  }

  if (compared === 0) return factors.length ? { verdict: "Сложно оценить по твоим данным", tone: "info", factors } : null

  const risks = factors.filter((f) => f.status === "risk").length
  if (score >= 1 && risks === 0) return { verdict: "Шансы хорошие", tone: "ok", factors }
  if (risks >= 2 || score <= -1) return { verdict: "Шансы невысокие", tone: "risk", factors }
  return { verdict: "Шансы средние", tone: "warn", factors }
}

/* ---------- small pieces ---------- */
function DeadlineBadge({ days }: { days: number }) {
  const d = deadlineLabel(days)
  const variant =
    d.tone === "danger" ? "destructive" : d.tone === "warn" ? "warning" : d.tone === "info" ? "default" : "secondary"
  return (
    <Badge variant={variant}>
      <Calendar className="size-3" /> {d.txt}
    </Badge>
  )
}

function SectionHeading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn("text-xs font-semibold tracking-widest text-fg-muted uppercase", className)}>{children}</h2>
  )
}

/* ---------- full report block body (RichBlock nodes) ---------- */
const isUrl = (s: string) => /^https?:\/\//i.test(s.trim())

function Cell({ value }: { value: string }) {
  if (isUrl(value)) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 break-all text-accent-text hover:underline"
      >
        {value.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
        <ArrowUpRight className="size-3 shrink-0" />
      </a>
    )
  }
  return <>{value}</>
}

function RichBlockBody({ block }: { block: RichBlock }) {
  return (
    <div className="flex flex-col gap-3.5">
      {block.nodes.map((n, i) => {
        if (n.type === "sub")
          return (
            <h3 key={i} className="mt-1.5 text-sm font-semibold text-fg first:mt-0">
              {n.text}
            </h3>
          )
        if (n.type === "p" && n.ru)
          return (
            <div key={i} className="flex gap-2.5 rounded-xl border border-accent/30 bg-accent-soft p-3.5">
              <span className="shrink-0 text-base leading-none">🇷🇺</span>
              <p className="text-[13px] leading-relaxed text-fg-muted">
                <strong className="font-semibold text-accent-text">Для России: </strong>
                {n.text}
              </p>
            </div>
          )
        if (n.type === "p")
          return (
            <p key={i} className="text-sm leading-relaxed text-fg-muted">
              {n.text}
            </p>
          )
        if (n.type === "ul")
          return (
            <ul key={i} className="flex flex-col gap-2 text-sm leading-relaxed">
              {n.items.map((it, j) => (
                <li key={j} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-accent-text" />
                  <span className="min-w-0 text-fg-muted">
                    <Cell value={it} />
                  </span>
                </li>
              ))}
            </ul>
          )
        // table – horizontal scroll on narrow screens
        return (
          <div key={i} className="-mx-1 overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border-strong text-left">
                  {n.headers.map((h, j) => (
                    <th key={j} className="px-2.5 py-2 font-semibold whitespace-nowrap text-fg">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {n.rows.map((row, r) => (
                  <tr key={r} className="border-b border-border last:border-0">
                    {row.map((c, j) => (
                      <td key={j} className="px-2.5 py-2 align-top leading-relaxed text-fg-muted">
                        <Cell value={c} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}

      {block.sources.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-3 text-xs text-fg-faint">
          <span>{block.sources.length > 1 ? "Источники:" : "Источник:"}</span>
          {block.sources.map((url, i) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-accent-text hover:underline"
            >
              {block.sources.length > 1 ? `Источник ${i + 1}` : "Открыть"}
              <ArrowUpRight className="size-3" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- rich profile section body (uniContent) ---------- */
function SectionBody({ s }: { s: UniSection }) {
  return (
    <div className="flex flex-col gap-3">
      {s.body && <p className="text-sm leading-relaxed text-fg-muted">{s.body}</p>}
      {s.facts && s.facts.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm leading-relaxed">
          {s.facts.map((f) => (
            <li key={f} className="flex items-start gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-accent-text" />
              <span className="text-fg-muted">{f}</span>
            </li>
          ))}
        </ul>
      )}
      {(s.pros || s.cons) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {s.pros && (
            <div>
              <div className="mb-2 text-xs font-semibold tracking-widest text-positive uppercase">Плюсы</div>
              <ul className="flex flex-col gap-2 text-sm leading-relaxed">
                {s.pros.map((p) => (
                  <li key={p} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-positive" />
                    <span className="text-fg-muted">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {s.cons && (
            <div>
              <div className="mb-2 text-xs font-semibold tracking-widest text-warning uppercase">Минусы</div>
              <ul className="flex flex-col gap-2 text-sm leading-relaxed">
                {s.cons.map((c) => (
                  <li key={c} className="flex items-start gap-2.5">
                    <Minus className="mt-0.5 size-4 shrink-0 text-warning" />
                    <span className="text-fg-muted">{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {s.note && <p className="text-[13px] leading-relaxed text-fg-faint">{s.note}</p>}
      {s.ru && (
        <div className="flex gap-2.5 rounded-xl border border-accent/30 bg-accent-soft p-3.5">
          <span className="shrink-0 text-base leading-none">🇷🇺</span>
          <p className="text-[13px] leading-relaxed text-fg-muted">
            <strong className="font-semibold text-accent-text">Для России: </strong>
            {s.ru}
          </p>
        </div>
      )}
    </div>
  )
}

function KvList({ rows }: { rows: { k: string; v: string }[] }) {
  return (
    <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3 text-sm">
      {rows.map((r) =>
        r.v ? (
          <Fragment key={r.k}>
            <dt className="text-fg-muted">{r.k}</dt>
            <dd className="min-w-0 font-medium break-words">{r.v}</dd>
          </Fragment>
        ) : null,
      )}
    </dl>
  )
}

/* ---------- page ---------- */
export interface DetailProps {
  item: AnyProgram
  onBack: () => void
  saved: boolean
  prio: boolean
  toggleSave: (id: string) => void
  togglePrio: (id: string) => void
  addRoadmap: (item: AnyProgram) => void
  hasRoadmap: boolean
  openDetail: (item: AnyProgram) => void
}

export default function Detail({
  item,
  onBack,
  saved,
  prio,
  toggleSave,
  togglePrio,
  addRoadmap,
  hasRoadmap,
  openDetail,
}: DetailProps) {
  const it = item
  const uniGrants = "program" in it ? grantsForUni(it) : []
  const content = UNI_CONTENT[it.id]
  const onbProfile = useMemo(() => readPersist<OnbProfile | null>("onboardingProfile", null), [])
  const chances = "program" in it ? estimateChances(it, onbProfile) : null

  // Full report blocks are code-split – load on demand for this uni.
  const [blocks, setBlocks] = useState<RichBlock[] | null>(null)
  useEffect(() => {
    let alive = true
    setBlocks(null)
    content?.loadBlocks?.().then((b) => {
      if (alive) setBlocks(b)
    })
    return () => {
      alive = false
    }
  }, [content])

  const reqs: { k: string; v: string }[] =
    "program" in it
      ? [
          { k: "Язык", v: it.language },
          { k: "IELTS / Lang", v: it.ielts },
          { k: "Оценки", v: it.gpa },
          { k: "Дедлайн", v: it.deadline },
        ]
      : "funding" in it
        ? [
            { k: "Кому", v: it.eligibility },
            { k: "Уровень", v: it.degree },
            { k: "Финансирование", v: it.funding },
            { k: "Дедлайн", v: it.deadline },
          ]
        : [
            { k: "Требования", v: it.requirements },
            { k: "Длительность", v: it.duration },
            { k: "Формат", v: it.format },
            { k: "Дедлайн", v: it.deadline },
          ]

  const facts: { k: string; v: string }[] =
    "program" in it
      ? [
          { k: "Город", v: `${it.flag} ${it.city}, ${it.country}` },
          { k: "Программа", v: it.program },
          { k: "Степень", v: it.degree },
          { k: "Направление", v: it.field },
          { k: "Стоимость", v: it.tuition },
          { k: "Стипендии", v: it.scholarship ? "Доступны" : "–" },
        ]
      : "funding" in it
        ? [
            { k: "Страна", v: `${it.flag} ${it.country}` },
            { k: "Организация", v: it.org },
            { k: "Размер", v: it.amount },
            { k: "Покрытие", v: it.funding },
            { k: "Уровень", v: it.degree },
            { k: "Направление", v: it.field },
          ]
        : [
            { k: "Город", v: `${it.flag} ${it.city}` },
            { k: "Роль", v: it.role },
            { k: "Индустрия", v: it.industry },
            { k: "Стипендия", v: it.stipend },
            { k: "Длительность", v: it.duration },
            { k: "Формат", v: it.format },
          ]

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      {/* back */}
      <motion.div variants={fadeUp} className="mb-5">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
          <ArrowLeft /> Назад к подбору
        </Button>
      </motion.div>

      {/* head */}
      <motion.div variants={fadeUp} className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
        <ProgramLogo item={it} className="size-16 rounded-2xl text-2xl font-semibold sm:size-18" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{it.name}</h1>
            <DeadlineBadge days={it.deadlineDays} />
          </div>
          <div className="mt-1.5 text-sm text-fg-muted sm:text-base">
            {"program" in it ? it.program : "funding" in it ? `${it.org} · ${it.country}` : `${it.role} · ${it.industry}`}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button onClick={() => addRoadmap(it)} disabled={hasRoadmap}>
              {hasRoadmap ? (
                <>
                  <Check /> В дорожной карте
                </>
              ) : (
                <>
                  Создать дорожную карту <ArrowRight />
                </>
              )}
            </Button>
            <Button variant={saved ? "outline" : "ghost"} onClick={() => toggleSave(it.id)}>
              <Heart className={cn(saved && "fill-current")} /> {saved ? "Сохранено" : "Сохранить"}
            </Button>
            <Button
              variant={prio ? "outline" : "ghost"}
              onClick={() => togglePrio(it.id)}
              className={cn(prio && "border-warning/60 text-warning hover:text-warning")}
            >
              <Star className={cn(prio && "fill-current")} /> {prio ? "В приоритетах" : "Приоритет"}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* quick-fact chips */}
      {content && (
        <motion.div variants={fadeUp} className="mt-6 flex flex-wrap gap-2">
          {content.chips.map((c) => (
            <span
              key={c}
              className="rounded-full border border-border bg-card-2 px-3 py-1.5 text-xs font-medium text-fg-muted"
            >
              {c}
            </span>
          ))}
        </motion.div>
      )}

      {/* body grid */}
      <div className="mt-8 grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {/* left column */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <motion.div variants={fadeUp}>
            <Card className="gap-0 p-6 sm:p-7">
              <SectionHeading>О программе</SectionHeading>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">{it.desc}</p>

              {"program" in it && !content && (
                <>
                  <SectionHeading className="mt-7">Что стоит знать</SectionHeading>
                  <ul className="mt-3 flex flex-col gap-2.5 text-sm leading-relaxed text-fg-muted">
                    {[
                      "Обучение на английском, диплом признаётся в ЕС",
                      "Есть программы обмена и стажировки во время учёбы",
                      "Студенты из России поступают на общих основаниях",
                      "Стоимость и условия указаны в блоке требований ниже",
                    ].map((li) => (
                      <li key={li} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 size-4 shrink-0 text-accent-text" />
                        {li}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </motion.div>

          {/* full report blocks (code-split, lazy) */}
          {content?.loadBlocks && (
            <motion.div variants={fadeUp}>
              <SectionHeading className="mb-3 px-1">Полный профиль вуза</SectionHeading>
              {blocks ? (
                <Accordion>
                  {blocks.map((b, i) => (
                    <AccordionItem key={b.title} title={b.title} defaultOpen={i === 0}>
                      <RichBlockBody block={b} />
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : (
                <div className="flex flex-col gap-3">
                  {[0, 1, 2].map((i) => (
                    <Card key={i} className="h-14 animate-pulse gap-0 p-0" />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* lighter editorial sections (fallback) */}
          {content?.sections && content.sections.length > 0 && (
            <motion.div variants={fadeUp}>
              <SectionHeading className="mb-3 px-1">Профиль вуза</SectionHeading>
              <Accordion>
                {content.sections.map((s, i) => (
                  <AccordionItem key={s.title} title={s.title} accent={s.accent} defaultOpen={i === 0}>
                    <SectionBody s={s} />
                  </AccordionItem>
                ))}
              </Accordion>
            </motion.div>
          )}

          <motion.div variants={fadeUp}>
            <Card className="gap-0 p-6 sm:p-7">
              <SectionHeading>Требования к поступлению</SectionHeading>
              <KvList rows={reqs} />
            </Card>
          </motion.div>

          {/* FAQ (sections-based unis only; report blocks include their own FAQ) */}
          {content?.faq && content.faq.length > 0 && (
            <motion.div variants={fadeUp}>
              <SectionHeading className="mb-3 px-1">Частые вопросы</SectionHeading>
              <Accordion>
                {content.faq.map((f) => (
                  <AccordionItem key={f.q} title={f.q}>
                    <p className="text-sm leading-relaxed text-fg-muted">{f.a}</p>
                  </AccordionItem>
                ))}
              </Accordion>
            </motion.div>
          )}
        </div>

        {/* right column */}
        <div className="flex flex-col gap-4">
          <motion.div variants={fadeUp}>
            <Card className="gap-0 p-6">
              <SectionHeading>Ключевые факты</SectionHeading>
              <KvList rows={facts} />
            </Card>
          </motion.div>

          {uniGrants.length > 0 && (
            <motion.div variants={fadeUp}>
              <Card className="gap-0 p-4 pt-5">
                <SectionHeading className="px-2">Гранты по этому вузу</SectionHeading>
                <div className="mt-2 flex flex-col gap-1">
                  {uniGrants.map((g) => (
                    <motion.div
                      key={g.id}
                      whileHover={{ x: 3 }}
                      transition={{ duration: 0.2, ease: EASE }}
                      className="group flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 transition-colors duration-200 hover:bg-fg/5"
                      onClick={() => openDetail(g)}
                    >
                      <ProgramLogo item={g} className="size-9 rounded-xl text-sm font-semibold" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">{g.name}</div>
                        <div className="truncate text-xs text-fg-muted">{g.amount}</div>
                      </div>
                      <Badge
                        variant={/полное/i.test(g.funding) ? "default" : "secondary"}
                        className="max-w-28 shrink-0"
                      >
                        <span className="truncate">{g.funding}</span>
                      </Badge>
                      <ArrowUpRight className="size-4 shrink-0 text-fg-faint opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                    </motion.div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}

          {"site" in it && it.site && (
            <motion.div variants={fadeUp}>
              <Card className="gap-0 p-6">
                <SectionHeading>Официальный сайт</SectionHeading>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-text hover:underline"
                >
                  {it.site} <ArrowUpRight className="size-4" />
                </a>
              </Card>
            </motion.div>
          )}

          {chances && (
            <motion.div variants={fadeUp}>
              <Card className="gap-0 border-accent/20 bg-accent-soft p-6">
                <div className="flex items-center gap-2">
                  <Target className="size-3.5 text-accent-text" />
                  <strong className="text-[13px] font-semibold text-accent-text">Оценка шансов</strong>
                </div>
                <div
                  className={cn(
                    "mt-2 text-sm font-semibold",
                    chances.tone === "ok"
                      ? "text-positive"
                      : chances.tone === "warn"
                        ? "text-warning"
                        : chances.tone === "risk"
                          ? "text-danger"
                          : "text-fg",
                  )}
                >
                  {chances.verdict}
                </div>
                <ul className="mt-2.5 flex flex-col gap-2">
                  {chances.factors.map((f, i) => {
                    const Icon = f.status === "ok" ? Check : f.status === "risk" ? X : Minus
                    const color =
                      f.status === "ok"
                        ? "text-positive"
                        : f.status === "warn"
                          ? "text-warning"
                          : f.status === "risk"
                            ? "text-danger"
                            : "text-fg-faint"
                    return (
                      <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-fg-muted">
                        <Icon className={cn("mt-0.5 size-3.5 shrink-0", color)} />
                        <span>{f.text}</span>
                      </li>
                    )
                  })}
                </ul>
                <p className="mt-3 text-xs leading-relaxed text-fg-faint">
                  Прикидка по твоим данным из подбора. Итог зависит ещё от мотивационного письма, рекомендаций и конкурса в этом году.
                </p>
              </Card>
            </motion.div>
          )}

          <motion.div variants={fadeUp}>
            <Card className="gap-0 border-accent/20 bg-accent-soft p-6">
              <div className="flex items-center gap-2">
                <Calendar className="size-3.5 text-accent-text" />
                <strong className="text-[13px] font-semibold text-accent-text">С чего начать</strong>
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed text-fg-muted">
                Начните мотивационное письмо за 2–3 месяца до дедлайна – на черновики и правки уходит больше времени,
                чем кажется. Заявку на грант подавайте параллельно: сроки часто не совпадают с приёмом в вуз.
              </p>
            </Card>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}
