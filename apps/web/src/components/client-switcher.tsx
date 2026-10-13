/** Pick the client to work on. A plain GET form, so it works without JS; the button submits the choice. */
export function ClientSwitcher({ action, clients, current, label, button, keep = {} }: { action: string; clients: { id: string; name: string }[]; current: string; label: string; button: string; keep?: Record<string, string> }) {
  return (
    <form method="get" action={action} className="client-switcher">
      {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label htmlFor="client-switch">{label}</label>
      <select id="client-switch" name="client" defaultValue={current}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <button className="btn small ghost">{button}</button>
    </form>
  );
}
