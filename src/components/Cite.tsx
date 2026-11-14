import { createContext, useContext, useId, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { SOURCE_LABEL, type Evidence } from '../data/demo'

interface EvidenceCtx {
  byId: Record<string, Evidence>
  open: (id: string) => void
  focus: string | null
}

export const EvidenceContext = createContext<EvidenceCtx>({ byId: {}, open: () => {}, focus: null })

// Inline citation chip with a hover card. Data sources are solid; your inputs
// are filled; assumptions are dashed so a guess never looks like a fact.
export function Cite({ id }: { id: string }) {
  const { byId, open, focus } = useContext(EvidenceContext)
  const [show, setShow] = useState(false)
  const tip = useId()
  const ev = byId[id]
  if (!ev) return null
  return (
    <span className="cite-wrap" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <button
        type="button"
        className={`cite cite-${ev.kind}${focus === id ? ' is-focus' : ''}`}
        aria-describedby={show ? tip : undefined}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        onClick={() => open(id)}
      >
        {SOURCE_LABEL[ev.kind]}
      </button>
      <AnimatePresence>
        {show && (
          <motion.span
            id={tip}
            role="tooltip"
            className="cite-card"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="label cite-card-kind">
              {ev.id} · {SOURCE_LABEL[ev.kind]} · {ev.confidence}
            </span>
            <span className="cite-card-claim">{ev.claim}</span>
            <span className="cite-card-detail">{ev.detail}</span>
            {ev.verify && <span className="label cite-card-verify">Needs verification</span>}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

export function Cites({ ids }: { ids: string[] }) {
  return (
    <span className="cites">
      {ids.map((id) => (
        <Cite key={id} id={id} />
      ))}
    </span>
  )
}
