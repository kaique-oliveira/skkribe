import { motion } from 'framer-motion'

/**
 * Apple-style "pop in" entry animation, fade + scale from 86% with a
 * subtle rubber-band overshoot. Mirrors `Theme/Animations.swift` so the
 * Electron and Swift apps feel identical when navigating between views.
 *
 * Stack `delay` across siblings for a cascading reveal (0, 0.05, 0.10, …).
 */
export function PopIn({ delay = 0, children, className = '', as = 'div' }) {
  const MotionTag = motion[as] || motion.div
  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, scale: 0.86 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        // response 0.45 + damping 0.68 in SwiftUI ≈ spring stiffness 280 + damping 18 here
        type: 'spring',
        stiffness: 280,
        damping: 18,
        delay,
      }}
    >
      {children}
    </MotionTag>
  )
}
