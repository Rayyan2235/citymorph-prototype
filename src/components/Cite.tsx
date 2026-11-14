import { createContext, useContext, useId, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Building2, CircleDashed, ScanLine, Satellite, UserRound, type LucideIcon } from 'lucide-react'
import { SOURCE_LABEL, type Evidence, type SourceKind } from '../data/demo'

interface EvidenceCtx {
  byId: Record<string, Evidence>
  open: (id: string) => void
  focus: string | null
}

export const EvidenceContext = createContext<EvidenceCtx>({ byId: {}, open: () => {}, focus: null })

export const SOURCE_ICON: Record<SourceKind, LucideIcon> = {
  user: UserRound,
  costar: Building2,
  matterport: ScanLine,
  vexcel: Satellite,
  assumption: CircleDashed,
}

// Source chip: an icon, not a code. Hover or focus shows the claim; click opens
// the evidence trail. Assumptions are dashed so a guess never looks like a fact.
export function Cite({ id }: { id: string }) {
  const { byId, open, focus } = useContext(EvidenceContext)
  const [show, setShow] = useState(false)
  const tip = useId()
  const ev = byId[id]
  if (!ev) return null
  const Icon = SOURCE_ICON[ev.kind]
  return (
    <span className="cite-wrap" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <button
        type="button"
        className={`cite cite-${ev.kind}${focus === id ? ' is-focus' : ''}`}
        aria-label={`Source: ${SOURCE_LABEL[ev.kind]}. ${ev.claim}`}
        aria-describedby={show ? tip : undefined}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        onClick={(e) => (e.stopPropagation(), open(id))}
      >
        <Icon size={12} strokeWidth={1.8} aria-hidden="true" />
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
            <span className="mono-label cite-card-kind">
              {SOURCE_LABEL[ev.kind]} · {ev.confidence}
            </span>
            <span className="cite-card-claim">{ev.claim}</span>
            <span className="cite-card-detail">{ev.detail}</span>
            {ev.verify && <span className="mono-label cite-card-verify">Needs a site visit</span>}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

export function Cites({ ids }: { ids: string[] }) {
  return (
    <span className="cites">
      {[...new Set(ids)].map((id) => (
        <Cite key={id} id={id} />
      ))}
    </span>
  )
}
