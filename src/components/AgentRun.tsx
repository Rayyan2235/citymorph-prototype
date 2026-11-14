import { AnimatePresence, motion } from 'motion/react'
import { Check, CornerDownRight } from 'lucide-react'
import { Cites } from './Cite'

export interface Step {
  key: string
  agent: string
  title: string
  detail: string
  cites: string[]
  state: 'pending' | 'active' | 'done' | 'struck'
  replan?: boolean
}

// The agent's plan, written before it acts. On a replan, superseded lines are
// struck through and new lines appear under them, so the change is visible.
export function AgentRun({ steps }: { steps: Step[] }) {
  return (
    <ol className="run" aria-live="polite">
      <AnimatePresence initial={false}>
        {steps
          .filter((s) => s.state !== 'pending')
          .map((s) => (
            <motion.li
              key={s.key}
              layout
              className={`run-step is-${s.state}${s.replan ? ' is-replan' : ''}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="run-mark" aria-hidden="true">
                {s.state === 'done' ? <Check size={12} strokeWidth={2} /> : s.replan ? <CornerDownRight size={12} strokeWidth={1.75} /> : null}
              </span>
              <span className="run-body">
                <span className="label run-agent">{s.agent}</span>
                <span className="run-title">{s.title}</span>
                {s.state !== 'active' && (
                  <span className="run-detail">
                    {s.detail} <Cites ids={s.cites} />
                  </span>
                )}
              </span>
            </motion.li>
          ))}
      </AnimatePresence>
    </ol>
  )
}
