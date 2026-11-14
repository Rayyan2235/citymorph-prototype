import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown } from 'lucide-react'

export type AgentName = 'Translator' | 'Scout' | 'Inspector' | 'Ranker' | 'Planner' | 'Economist' | 'Simulator'

export interface LogLine {
  id: number
  agent: AgentName
  text: string
  tone?: 'fail' | 'ok'
}

// The reasoning HUD: each step of the pipeline says what it did, in order.
// Every line is computed from the evaluator; no language model is running.
export function AgentLog({ lines }: { lines: LogLine[] }) {
  const [open, setOpen] = useState(true)
  const shown = lines.slice(-6)
  return (
    <section className={`agentlog float${open ? '' : ' is-closed'}`} aria-label="Agent log">
      <button type="button" className="al-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="mono-label">Agent log · {lines.length} steps</span>
        <ChevronDown size={14} strokeWidth={1.8} className="al-chev" />
      </button>
      {open && (
        <>
          <ol className="al-list" aria-live="polite">
            <AnimatePresence initial={false}>
              {shown.map((l, i) => (
                <motion.li
                  key={l.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: i === shown.length - 1 ? 1 : 0.55 + (i / shown.length) * 0.35, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className={`al-line${l.tone ? ` is-${l.tone}` : ''}`}
                >
                  <span className="mono-label al-agent">{l.agent}</span>
                  <span className="al-text">{l.text}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
          <p className="mono-label al-foot">Rules and scores run in code · no live AI model in this prototype</p>
        </>
      )}
    </section>
  )
}
