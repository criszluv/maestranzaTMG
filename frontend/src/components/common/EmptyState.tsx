import { Icon, type IconName } from './Icon'

interface EmptyStateProps {
  icon?: IconName
  title: string
  description?: string
}

/** Mensaje consistente para "no hay datos todavía", en vez de un <p> suelto distinto en cada pantalla. */
export function EmptyState({ icon = 'vacio', title, description }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <Icon name={icon} size={34} className="empty-state__icon" />
      <div className="empty-state__title">{title}</div>
      {description && <div className="empty-state__desc">{description}</div>}
    </div>
  )
}
