import { useToast } from '../contexts/ToastContext'
import styles from './Toasts.module.css'

export function Toasts() {
  const { toasts } = useToast()
  const latest = toasts[toasts.length - 1]
  if (!latest) return null

  return (
    <div className={`${styles.toast} ${styles[latest.type]}`}>
      {latest.message}
    </div>
  )
}
