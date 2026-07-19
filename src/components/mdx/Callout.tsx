type CalloutProps = {
  type: "info" | "warning" | "error";
  children: React.ReactNode;
};

const styles = {
  info: "border-blue-500 bg-blue-50 text-blue-900",
  warning: "border-yellow-500 bg-yellow-50 text-yellow-900",
  error: "border-red-500 bg-red-50 text-red-900",
};

const icons = {
  info: "ℹ",
  warning: "⚠",
  error: "✕",
};

export function Callout({ type, children }: CalloutProps) {
  return (
    <div
      className={`my-6 flex gap-3 rounded-lg border-l-4 p-4 ${styles[type]}`}
    >
      <span className="mt-0.5 text-lg">{icons[type]}</span>
      <div className="[&>:first-child]:mt-0 [&>:last-child]:mb-0">
        {children}
      </div>
    </div>
  );
}
