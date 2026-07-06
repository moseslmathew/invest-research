import PrismWaitIcon from "../PrismWaitIcon";

export default function DashboardLoading() {
  return (
    <div
      className="pw-loader-container prism-loading-panel"
      style={{ minHeight: "100vh" }}
    >
      <PrismWaitIcon size={64} />
      <p>Loading your watchlists...</p>
    </div>
  );
}
