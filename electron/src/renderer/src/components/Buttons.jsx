// Pill buttons mirroring Views/ButtonStyles.swift.
// Always rounded-full (the design system rule: "esquina viva é exceção").

import React from 'react'

const base = 'inline-flex items-center justify-center gap-2 transition-colors transition-opacity duration-100 select-none'

export const PrimaryButton = React.forwardRef(function PrimaryButton(
  { children, className = '', ...props }, ref
) {
  return (
    <button
      ref={ref}
      className={`${base} h-10 px-5 rounded-full bg-accent hover:bg-accent-hover active:opacity-85 text-white text-sm font-semibold whitespace-nowrap ${className}`}
      {...props}
    >
      {children}
    </button>
  )
})

export const SecondaryButton = React.forwardRef(function SecondaryButton(
  { children, className = '', ...props }, ref
) {
  return (
    <button
      ref={ref}
      className={`${base} h-8 px-3.5 rounded-full bg-nested hover:bg-hover active:opacity-70 text-ink-1 text-[13px] font-medium whitespace-nowrap ${className}`}
      {...props}
    >
      {children}
    </button>
  )
})

export const LinkButton = React.forwardRef(function LinkButton(
  { children, className = '', ...props }, ref
) {
  return (
    <button
      ref={ref}
      className={`${base} text-accent-soft-text hover:text-accent text-[13px] font-semibold ${className}`}
      {...props}
    >
      {children}
    </button>
  )
})

/** The 28×28 circle hover-only icon button (used in TitleBar gear, etc). */
export const IconButton = React.forwardRef(function IconButton(
  { children, className = '', ...props }, ref
) {
  return (
    <button
      ref={ref}
      className={`${base} w-7 h-7 rounded-full text-ink-2 hover:bg-hover hover:text-ink-1 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
})
