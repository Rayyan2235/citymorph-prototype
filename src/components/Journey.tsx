import { motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, RotateCcw } from 'lucide-react'

export const STEPS = [
  { id: 'need', label: 'Need', next: 'Find buildings' },
  { id: 'find', label: 'Find', next: 'Check the rules' },
  { id: 'check', label: 'Check', next: 'Open the studio' },
  { id: 'studio', label: 'Studio', next: 'Run the disasters' },
  { id: 'impact', label: 'Disasters', next: 'Start over' },
] as const

interface Props {
  step: number
  busy: boolean
  onGo: (step: number) => void
}

// The journey dock: where you are, and the one thing to do next.
export function Journey({ step, busy, onGo }: Props) {
  const last = step === STEPS.length - 1
  return (
    <nav className="dock" aria-label="Journey">
      <ol className="stepper">
        {STEPS.map((s, i) => {
          const state = i < step ? 'done' : i === step ? 'active' : 'todo'
          return (
            <li key={s.id}>
              <button
                type="button"
                className={`stp is-${state}`}
                onClick={() => onGo(i)}
                aria-current={i === step ? 'step' : undefined}
                disabled={busy && i > step}
              >
                {i === step && <motion.span layoutId="stp-pill" className="stp-pill" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                <span className="stp-n">{state === 'done' ? <Check size={11} strokeWidth={2.6} /> : i + 1}</span>
                <span className="stp-label">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && <span className={`stp-line${i < step ? ' is-done' : ''}`} aria-hidden="true" />}
            </li>
          )
        })}
      </ol>
      <div className="dock-actions">
        {step > 0 && (
          <button type="button" className="btn-ghost" onClick={() => onGo(step - 1)} aria-label="Back">
            <ArrowLeft size={16} strokeWidth={1.8} />
          </button>
        )}
        <button type="button" className="btn-primary" onClick={() => onGo(last ? 0 : step + 1)} disabled={busy}>
          {STEPS[step].next}
          {last ? <RotateCcw size={15} strokeWidth={1.9} /> : <ArrowRight size={15} strokeWidth={1.9} />}
        </button>
      </div>
    </nav>
  )
}
