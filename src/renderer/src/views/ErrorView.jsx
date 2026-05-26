import { PopIn } from '../components/PopIn'
import { PrimaryButton } from '../components/Buttons'
import { IconBadge } from '../components/StatusPill'
import { IconArrowReload, IconExclamation } from '../components/icons'

export function ErrorView({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center w-full max-w-[460px] mx-auto px-6 pt-8 space-y-5">
      <PopIn>
        <IconBadge fill="#DC2626" size={64}><div className="text-[28px]"><IconExclamation /></div></IconBadge>
      </PopIn>
      <PopIn delay={0.05}>
        <div className="text-center space-y-1.5">
          <h1 className="text-[22px] font-bold text-ink-1">Algo deu errado</h1>
          <p className="text-[13px] text-ink-2 px-6 break-words">{message}</p>
        </div>
      </PopIn>
      <PopIn delay={0.12}>
        <PrimaryButton onClick={onRetry}>
          <IconArrowReload className="text-base" />
          Tentar de novo
        </PrimaryButton>
      </PopIn>
    </div>
  )
}
