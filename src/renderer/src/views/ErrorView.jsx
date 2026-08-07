import { PopIn } from '../components/PopIn'
import { PrimaryButton, SecondaryButton } from '../components/Buttons'
import { IconBadge } from '../components/StatusPill'
import { IconArrowReload, IconExclamation } from '../components/icons'
import { isAuthError } from '../lib/errors'

export function ErrorView({ message, onRetry, onChangeToken }) {
  // A bad-token failure can't be fixed by retrying: the same saved token gets
  // reused every time. Offer the escape hatch that actually resolves it.
  const authProblem = isAuthError(message)

  return (
    <div className="my-auto py-8 flex flex-col items-center w-full max-w-[460px] mx-auto px-6 space-y-5">
      <PopIn>
        <IconBadge fill="#DC2626" size={64}><div className="text-[28px]"><IconExclamation /></div></IconBadge>
      </PopIn>
      <PopIn delay={0.05}>
        <div className="text-center space-y-1.5">
          <h1 className="text-[22px] font-bold text-ink-1">Algo deu errado</h1>
          <p className="text-[13px] text-ink-2 px-2 break-words whitespace-pre-line text-left">{message}</p>
        </div>
      </PopIn>
      <PopIn delay={0.12}>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <PrimaryButton onClick={onRetry}>
            <IconArrowReload className="text-base" />
            Tentar de novo
          </PrimaryButton>
          {authProblem && onChangeToken && (
            <SecondaryButton onClick={onChangeToken} className="h-10 px-5 text-sm">
              Trocar token
            </SecondaryButton>
          )}
        </div>
      </PopIn>
    </div>
  )
}
