// Shown when the stored franchise progress (the meta save) could not be loaded (GAME_DESIGN 8.2). Unlike
// SaveNotice it does not block: the game runs with an empty meta. The unreadable text is copied under the
// .corrupt key when the browser allows it. The warning icon and the heading carry the meaning, not colour.

export default function MetaNotice({ reason, onDismiss }: { reason: string; onDismiss: () => void }) {
  return (
    <div className="meta-notice" role="alert">
      <div className="meta-notice-body">
        <p className="meta-notice-title">
          <span aria-hidden="true">⚠</span> Could not load your franchise progress
        </p>
        <p className="notice-reason">
          <span className="notice-label">Reason</span> {reason}
        </p>
        <p className="notice-help">
          Points, perks and saved kitchens start empty. A copy of the unreadable file is kept in this browser when possible.
        </p>
      </div>
      <button type="button" className="btn-quiet" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  )
}
