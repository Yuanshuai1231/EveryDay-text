export default function SpaceRouteLoading() {
  return (
    <div className="route-loading" role="status" aria-label="正在打开页面">
      <span className="route-loading-spinner" aria-hidden="true" />
      <span>正在打开页面…</span>
    </div>
  );
}
