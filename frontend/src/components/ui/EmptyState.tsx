interface EmptyStateProps {
  message: string;
  action?: React.ReactNode;
}

export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div className="text-center py-20 text-gray-400">
      <p className="text-lg">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
